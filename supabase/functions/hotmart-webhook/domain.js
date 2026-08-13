export const PREMIUM_EVENTS = new Set([
  "PURCHASE_APPROVED",
  "PURCHASE_COMPLETE",
]);

export const FREE_EVENTS = new Set([
  "PURCHASE_CANCELED",
  "PURCHASE_REFUNDED",
  "PURCHASE_CHARGEBACK",
  "SUBSCRIPTION_CANCELLATION",
]);

const asObject = (value) => value && typeof value === "object" ? value : {};
const asText = (value) => typeof value === "string" ? value.trim() : "";

export function constantTimeEqual(left, right) {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const maxLength = Math.max(a.length, b.length);
  let difference = a.length ^ b.length;
  for (let index = 0; index < maxLength; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

export function getEventPlan(event) {
  if (PREMIUM_EVENTS.has(event)) return "premium";
  if (FREE_EVENTS.has(event)) return "free";
  return null;
}

export function parseHotmartWebhook(body) {
  const root = asObject(body);
  const data = asObject(root.data);
  const product = asObject(data.product);
  const buyer = asObject(data.buyer);
  const subscriber = asObject(data.subscriber);
  const purchase = asObject(data.purchase);
  const subscription = asObject(data.subscription);
  const subscriptionSubscriber = asObject(subscription.subscriber);

  const eventId = asText(root.id);
  const event = asText(root.event).toUpperCase();
  const version = asText(root.version);
  const email = asText(buyer.email || subscriber.email).toLowerCase();
  const creationDate = Number(root.creation_date);
  const transactionCode = asText(purchase.transaction);
  const subscriberCode = asText(subscriptionSubscriber.code || subscriber.code);
  const subscriptionId = subscription.id === undefined || subscription.id === null
    ? ""
    : String(subscription.id).trim();
  const entitlementKey = subscriberCode
    ? `subscriber:${subscriberCode}`
    : subscriptionId
      ? `subscription:${subscriptionId}`
      : transactionCode
        ? `transaction:${transactionCode}`
      : "";
  const productId = product.id === undefined || product.id === null
    ? ""
    : String(product.id).trim();
  const productUcode = asText(product.ucode);

  if (!eventId) throw new Error("event_id ausente");
  if (!event) throw new Error("evento ausente");
  if (version !== "2.0.0") throw new Error("versão de webhook não suportada");
  if (!email || !email.includes("@")) throw new Error("email ausente ou inválido");
  if (!Number.isFinite(creationDate) || creationDate <= 0) throw new Error("creation_date inválida");

  const eventCreatedAt = new Date(creationDate).toISOString();
  if (eventCreatedAt === "Invalid Date") throw new Error("creation_date inválida");

  return {
    eventId,
    event,
    version,
    email,
    eventCreatedAt,
    newPlan: getEventPlan(event),
    entitlementKey,
    transactionCode: transactionCode || null,
    subscriptionCode: subscriberCode || subscriptionId || null,
    productId: productId || null,
    productUcode: productUcode || null,
  };
}

export function isAllowedHotmartProduct(parsed, allowedProductIds, allowedProductUcodes) {
  const ids = new Set(allowedProductIds);
  const ucodes = new Set(allowedProductUcodes);
  return Boolean(
    (parsed.productId && ids.has(parsed.productId))
    || (parsed.productUcode && ucodes.has(parsed.productUcode))
  );
}

export function minimizeHotmartPayload(body) {
  const root = asObject(body);
  const data = asObject(root.data);
  const product = asObject(data.product);
  const purchase = asObject(data.purchase);
  const offer = asObject(purchase.offer);
  const subscription = asObject(data.subscription);
  const subscriber = asObject(data.subscriber);
  const subscriptionSubscriber = asObject(subscription.subscriber);

  return {
    id: root.id ?? null,
    creation_date: root.creation_date ?? null,
    event: root.event ?? null,
    version: root.version ?? null,
    data: {
      product: {
        id: product.id ?? null,
        ucode: product.ucode ?? null,
      },
      purchase: {
        transaction: purchase.transaction ?? null,
        status: purchase.status ?? null,
        approved_date: purchase.approved_date ?? null,
        offer_code: offer.code ?? null,
      },
      subscription: {
        id: subscription.id ?? null,
        subscriber_code: subscriptionSubscriber.code ?? subscriber.code ?? null,
      },
      cancellation_date: data.cancellation_date ?? null,
      date_next_charge: data.date_next_charge ?? null,
    },
  };
}
