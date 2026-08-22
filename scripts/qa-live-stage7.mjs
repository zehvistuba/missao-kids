import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

import { PLAN_LIMITS, TERMS_VERSION } from "../src/config/product.js";

const REQUIRED_CONFIRMATION = "RUN_LIVE_QA=1";
const QA_DOMAIN = "rotinup-qa.test";
const results = [];
const clientsToClean = [];

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const readLocalEnv = async () => {
  const contents = await readFile(new URL("../.env.local", import.meta.url), "utf8");
  return Object.fromEntries(contents.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) return [];
    const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
    return [[match[1], value]];
  }));
};

const createQaClient = (url, anonKey) => createClient(url, anonKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
});

const pass = (id, detail) => results.push({ id, status: "PASS", detail });

const assertNoError = (response, label) => {
  if (response.error) throw new Error(`${label}: ${response.error.message}`);
  return response.data;
};

const assertRejected = (response, label) => {
  const rejected = Boolean(response.error) || response.data?.success === false;
  assert.equal(rejected, true, `${label}: a operacao deveria ter sido rejeitada`);
};

const readOwnProfile = async (client, userId) => {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await client.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (response.error) throw new Error(`carregar perfil: ${response.error.message}`);
    if (response.data) return response.data;
    await sleep(250);
  }
  throw new Error("perfil de QA nao foi criado no prazo esperado");
};

const signUpParent = async ({ url, anonKey, suffix, requestedRole = "parent" }) => {
  const client = createQaClient(url, anonKey);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const email = `stage7-${stamp}-${suffix}@${QA_DOMAIN}`;
  const password = `Qa!${stamp}Aa9`;
  const response = await client.auth.signUp({
    email,
    password,
    options: { data: { display_name: `QA Stage 7 ${suffix}`, role: requestedRole } },
  });

  if (response.error) throw new Error(`signup ${suffix}: ${response.error.message}`);
  assert.ok(response.data.user, `signup ${suffix} nao retornou usuario`);
  assert.ok(response.data.session, "QA vivo bloqueado: confirmacao de email esta ativa");

  clientsToClean.push({ client, suffix });
  return { client, userId: response.data.user.id };
};

const createFamilyWithChild = async ({ client, userId, suffix }) => {
  assertNoError(await client.rpc("accept_terms", { p_terms_version: TERMS_VERSION }), `aceite ${suffix}`);
  assertNoError(await client.rpc("create_family", { p_family_name: `Familia QA ${suffix}` }), `familia ${suffix}`);

  const profile = await readOwnProfile(client, userId);
  assert.ok(profile.family_id, `familia ${suffix} nao foi vinculada ao perfil`);

  const family = assertNoError(
    await client.from("families").select("id,owner_id,plan,max_co_parents").eq("id", profile.family_id).single(),
    `consultar familia ${suffix}`,
  );
  assert.equal(family.owner_id, userId);
  assert.equal(family.plan, "free");

  assertNoError(await client.rpc("add_child", {
    p_age: 10,
    p_avatar_emoji: "🚀",
    p_birth_date: "2016-04-15",
    p_display_name: `Crianca QA ${suffix}`,
  }), `adicionar crianca ${suffix}`);

  const child = assertNoError(
    await client.from("profiles").select("id,family_id,role,kidcoins").eq("family_id", profile.family_id).eq("role", "child").single(),
    `consultar crianca ${suffix}`,
  );
  assert.equal(child.family_id, profile.family_id);
  return { family, profile, child };
};

const extractCreatedId = (data, label) => {
  const id = typeof data === "string" ? data : data?.id;
  assert.ok(id, `${label}: RPC nao retornou o id criado`);
  return id;
};

const createMission = async (client, index) => {
  const response = await client.rpc("create_mission", {
    p_coins_reward: 20,
    p_emoji: "✅",
    p_frequency: "daily",
    p_title: `Missao QA ${index}`,
    p_xp_reward: 10,
  });
  return { response, id: response.error || response.data?.success === false ? null : extractCreatedId(response.data, `missao ${index}`) };
};

const createReward = async (client, index) => {
  const response = await client.rpc("create_reward", {
    p_coin_cost: index === 3 ? 1 : 5,
    p_emoji: "🎁",
    p_title: `Recompensa QA ${index}`,
  });
  return { response, id: response.error || response.data?.success === false ? null : extractCreatedId(response.data, `recompensa ${index}`) };
};

const latestRedemption = async (client, childId, rewardId, status) => assertNoError(
  await client
    .from("redemption_logs")
    .select("id,reward_id,status,timer_state,timer_remaining_seconds")
    .eq("child_id", childId)
    .eq("reward_id", rewardId)
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle(),
  `consultar resgate ${status}`,
);

const redeemAndFind = async (client, childId, rewardId) => {
  const created = assertNoError(await client.rpc("redeem_for_child", {
    p_child_id: childId,
    p_quantity: 1,
    p_reward_id: rewardId,
  }), "resgatar recompensa");
  const logId = Array.isArray(created) ? created[0] : created?.id || created;
  assert.ok(logId, "resgate nao retornou identificador");
  const log = assertNoError(
    await client.from("redemption_logs").select("id,reward_id,status,timer_state,timer_remaining_seconds").eq("id", logId).single(),
    "consultar resgate criado",
  );
  assert.ok(["requested", "approved"].includes(log.status), `estado inicial inesperado: ${log.status}`);
  return log;
};

const approveAndDeliver = async (client, log) => {
  if (log.status === "requested") {
    assertNoError(await client.rpc("approve_redemption", { p_log_id: log.id }), "aprovar resgate");
  }
  assertNoError(await client.rpc("confirm_redemption", { p_log_id: log.id }), "confirmar entrega");
};

const readKidcoins = async (client, childId) => {
  const profile = assertNoError(
    await client.from("profiles").select("kidcoins").eq("id", childId).single(),
    "consultar KidCoins",
  );
  return profile.kidcoins;
};

const cleanQaAccounts = async () => {
  const cleanupErrors = [];
  for (const { client, suffix } of [...clientsToClean].reverse()) {
    try {
      const response = await client.functions.invoke("delete-account");
      if (response.error || response.data?.error) {
        throw new Error(response.data?.error || response.error?.message || "falha desconhecida");
      }
      await client.auth.signOut();
    } catch (error) {
      cleanupErrors.push(`${suffix}: ${error.message}`);
    }
  }
  return cleanupErrors;
};

const run = async () => {
  assert.equal(process.env.RUN_LIVE_QA, "1", `execucao viva exige ${REQUIRED_CONFIRMATION}`);
  const env = await readLocalEnv();
  assert.ok(env.VITE_SUPABASE_URL, "VITE_SUPABASE_URL ausente");
  assert.ok(env.VITE_SUPABASE_ANON, "VITE_SUPABASE_ANON ausente");

  let primaryError;
  try {
    const accountA = await signUpParent({ ...env, url: env.VITE_SUPABASE_URL, anonKey: env.VITE_SUPABASE_ANON, suffix: "A", requestedRole: "admin" });
    const profileA = await readOwnProfile(accountA.client, accountA.userId);
    assert.equal(profileA.role, "parent", "metadata controlado pelo cliente conseguiu criar admin");
    assertRejected(await accountA.client.rpc("admin_get_families"), "RPC admin por responsavel comum");
    assertRejected(await accountA.client.from("profiles").update({ role: "admin" }).eq("id", accountA.userId), "escalada direta de role");
    assertRejected(await accountA.client.from("profiles").update({ kidcoins: 999999 }).eq("id", accountA.userId), "escalada direta de KidCoins");
    pass("K4", "signup e PATCH nao permitem auto-admin nem KidCoins arbitrarios");

    const familyA = await createFamilyWithChild({ ...accountA, suffix: "A" });
    const missions = [];
    for (let index = 1; index <= PLAN_LIMITS.free.activeMissions; index += 1) {
      const mission = await createMission(accountA.client, index);
      assertNoError(mission.response, `criar missao ${index}`);
      missions.push(mission.id);
    }
    assertRejected((await createMission(accountA.client, PLAN_LIMITS.free.activeMissions + 1)).response, "limite Free de missoes");

    const rewards = [];
    for (let index = 1; index <= PLAN_LIMITS.free.activeRewards; index += 1) {
      const reward = await createReward(accountA.client, index);
      assertNoError(reward.response, `criar recompensa ${index}`);
      rewards.push(reward.id);
    }
    assertRejected((await createReward(accountA.client, PLAN_LIMITS.free.activeRewards + 1)).response, "limite Free de recompensas");
    pass("B1-B4", "familia Free respeita 1 filho, 5 missoes e 3 recompensas ativas");

    assertNoError(await accountA.client.rpc("parent_check_mission", {
      p_child_id: familyA.child.id,
      p_mission_id: missions[0],
    }), "concluir missao gerenciada");
    assert.equal(await readKidcoins(accountA.client, familyA.child.id), 20);
    pass("U-child", "responsavel conclui missao no modo infantil gerenciado e libera KidCoins");

    assertNoError(await accountA.client.rpc("set_reward_duration", { p_minutes: 1, p_reward_id: rewards[0] }), "duracao recompensa 1");
    assertNoError(await accountA.client.rpc("set_reward_duration", { p_minutes: 1, p_reward_id: rewards[1] }), "duracao recompensa 2");

    const cancelledLog = await redeemAndFind(accountA.client, familyA.child.id, rewards[2]);
    assert.equal(await readKidcoins(accountA.client, familyA.child.id), 19);
    assertNoError(await accountA.client.rpc("cancel_redemption", { p_log_id: cancelledLog.id }), "cancelar resgate");
    assert.equal(await readKidcoins(accountA.client, familyA.child.id), 20);
    assertRejected(await accountA.client.rpc("cancel_redemption", { p_log_id: cancelledLog.id }), "cancelamento duplicado");
    assert.equal(await readKidcoins(accountA.client, familyA.child.id), 20);
    pass("R-cancel", "cancelamento estorna uma vez e repeticao e rejeitada");

    const firstRewardLog = await redeemAndFind(accountA.client, familyA.child.id, rewards[0]);
    await approveAndDeliver(accountA.client, firstRewardLog);
    const cumulativeLog = await redeemAndFind(accountA.client, familyA.child.id, rewards[0]);
    await approveAndDeliver(accountA.client, cumulativeLog);

    const rewardOneLogs = assertNoError(
      await accountA.client.from("redemption_logs").select("id,status,timer_state,timer_remaining_seconds").eq("child_id", familyA.child.id).eq("reward_id", rewards[0]),
      "consultar cronometro cumulativo",
    );
    const activeRewardOne = rewardOneLogs.find((log) => log.status === "delivered" && log.timer_state !== "merged");
    assert.ok(activeRewardOne?.id, "cronometro cumulativo ativo nao encontrado");
    assert.ok(activeRewardOne.timer_remaining_seconds >= 120, "tempo cumulativo nao foi somado");
    assert.ok(rewardOneLogs.some((log) => log.timer_state === "merged"), "segundo resgate nao foi marcado como incorporado");

    const secondRewardLog = await redeemAndFind(accountA.client, familyA.child.id, rewards[1]);
    await approveAndDeliver(accountA.client, secondRewardLog);
    const activeRewardTwo = await latestRedemption(accountA.client, familyA.child.id, rewards[1], "delivered");
    assert.ok(activeRewardTwo?.id, "segundo cronometro nao foi criado");

    assertNoError(await accountA.client.rpc("start_reward_timer", { p_log_id: activeRewardOne.id }), "iniciar cronometro 1");
    assertNoError(await accountA.client.rpc("start_reward_timer", { p_log_id: activeRewardTwo.id }), "iniciar cronometro 2");
    const running = assertNoError(
      await accountA.client.from("redemption_logs").select("id,timer_state").in("id", [activeRewardOne.id, activeRewardTwo.id]),
      "consultar cronometros simultaneos",
    );
    assert.equal(running.filter((log) => log.timer_state === "running").length, 2);
    assertNoError(await accountA.client.rpc("pause_reward_timer", { p_log_id: activeRewardOne.id }), "pausar cronometro 1");
    assertNoError(await accountA.client.rpc("finish_reward_timer", { p_log_id: activeRewardOne.id }), "concluir cronometro 1");
    assertNoError(await accountA.client.rpc("finish_reward_timer", { p_log_id: activeRewardTwo.id }), "concluir cronometro 2");
    pass("Timer", "cumulativo, simultaneo, pausa e conclusao passaram");

    const accountB = await signUpParent({ ...env, url: env.VITE_SUPABASE_URL, anonKey: env.VITE_SUPABASE_ANON, suffix: "B" });
    const familyB = await createFamilyWithChild({ ...accountB, suffix: "B" });
    const missionB = await createMission(accountB.client, "B");
    assertNoError(missionB.response, "criar missao familia B");
    const rewardB = await createReward(accountB.client, "B");
    assertNoError(rewardB.response, "criar recompensa familia B");

    const foreignFamily = assertNoError(
      await accountA.client.from("families").select("id").eq("id", familyB.family.id).maybeSingle(),
      "leitura cross-family de families",
    );
    const foreignChild = assertNoError(
      await accountA.client.from("profiles").select("id").eq("id", familyB.child.id).maybeSingle(),
      "leitura cross-family de profiles",
    );
    assert.equal(foreignFamily, null);
    assert.equal(foreignChild, null);
    assertRejected(await accountA.client.from("missions").insert({
      coins_reward: 1,
      emoji: "!",
      family_id: familyB.family.id,
      frequency: "daily",
      is_active: true,
      title: "Cross family QA",
      xp_reward: 1,
    }), "insert cross-family de mission");
    assertRejected(await accountA.client.rpc("redeem_for_child", {
      p_child_id: familyB.child.id,
      p_quantity: 1,
      p_reward_id: rewardB.id,
    }), "resgate cross-family");
    pass("K1-K7", "leituras, escrita de catalogo e resgate cross-family foram barrados");
  } catch (error) {
    primaryError = error;
  } finally {
    const cleanupErrors = await cleanQaAccounts();
    if (cleanupErrors.length) {
      const cleanupFailure = new Error(`limpeza LGPD falhou: ${cleanupErrors.join("; ")}`);
      primaryError = primaryError ? new AggregateError([primaryError, cleanupFailure], "QA e limpeza falharam") : cleanupFailure;
    } else if (clientsToClean.length) {
      pass("LGPD-cleanup", `${clientsToClean.length} contas sinteticas removidas pelo fluxo oficial`);
    }
  }

  if (primaryError) throw primaryError;
  process.stdout.write(`${JSON.stringify({ verdict: "PASS", checks: results }, null, 2)}\n`);
};

await run();
