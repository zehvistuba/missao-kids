import { useState } from 'react';
import { useAI } from '../hooks/useAI';

export function AISuggestMissions({ child, onAddMission }) {
  const { suggestMissions, loading, error } = useAI();
  const [suggestions, setSuggestions] = useState(null);
  const handleSuggest = async () => {
    const age = child.birth_date ? Math.floor((new Date() - new Date(child.birth_date)) / (365.25*24*60*60*1000)) : 8;
    const result = await suggestMissions(child.name, age);
    if (result?.missions) setSuggestions(result.missions);
  };
  return (
    <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl p-5 border border-purple-200">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">🤖</span>
        <h3 className="font-bold text-purple-800 text-lg">Missoes Sugeridas por IA</h3>
      </div>
      {!suggestions ? (
        <div className="text-center">
          <p className="text-purple-600 mb-4 text-sm">Deixe a IA sugerir missoes perfeitas para {child.name}!</p>
          <button onClick={handleSuggest} disabled={loading}
            className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-6 rounded-xl transition-all disabled:opacity-50">
            {loading ? 'Gerando...' : '✨ Gerar Sugestoes'}
          </button>
          {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
        </div>
      ) : (
        <div>
          <div className="space-y-2 mb-4">
            {suggestions.map((mission, i) => (
              <div key={i} className="bg-white rounded-xl p-3 flex items-center justify-between gap-2 shadow-sm">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{mission.category}</span>
                    <span className="font-semibold text-gray-800 text-sm">{mission.title}</span>
                  </div>
                  <p className="text-gray-500 text-xs mt-1">{mission.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-yellow-600 font-bold text-sm">{mission.points}pts</span>
                  <button onClick={() => onAddMission && onAddMission(mission)}
                    className="bg-green-500 hover:bg-green-600 text-white text-xs font-bold py-1 px-3 rounded-lg">+</button>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => { setSuggestions(null); handleSuggest(); }} disabled={loading}
            className="text-purple-600 hover:text-purple-800 text-sm font-medium">
            {loading ? 'Gerando...' : '🔄 Novas sugestoes'}
          </button>
        </div>
      )}
    </div>
  );
}

export function AIWeeklyReport({ child, missions }) {
  const { getWeeklyReport, loading, error } = useAI();
  const [report, setReport] = useState(null);
  const [show, setShow] = useState(false);
  const handleReport = async () => {
    const age = child.birth_date ? Math.floor((new Date() - new Date(child.birth_date)) / (365.25*24*60*60*1000)) : 8;
    const oneWeekAgo = new Date(); oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const weekMissions = (missions || []).filter(m => m.completed && new Date(m.completed_at) >= oneWeekAgo);
    const weekPoints = weekMissions.reduce((sum, m) => sum + (m.points || 0), 0);
    const totalPoints = (missions || []).filter(m => m.completed).reduce((sum, m) => sum + (m.points || 0), 0);
    const result = await getWeeklyReport(child.name, age, weekMissions.map(m => m.title), totalPoints, weekPoints);
    if (result) { setReport(result); setShow(true); }
  };
  return (
    <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl p-5 border border-blue-200">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">📊</span>
        <h3 className="font-bold text-blue-800 text-lg">Relatorio Semanal IA</h3>
      </div>
      {!show ? (
        <div className="text-center">
          <p className="text-blue-600 mb-4 text-sm">Analise do progresso de {child.name} esta semana.</p>
          <button onClick={handleReport} disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-xl transition-all disabled:opacity-50">
            {loading ? 'Gerando...' : '📊 Gerar Relatorio'}
          </button>
          {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
        </div>
      ) : (
        <div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed">{report}</pre>
          </div>
          <button onClick={() => setShow(false)} className="mt-3 text-blue-600 hover:text-blue-800 text-sm font-medium">Fechar</button>
        </div>
      )}
    </div>
  );
}

export function AIMotivationalFeedback({ childName, missionTitle, points, totalPoints, onClose }) {
  const { getMotivationalFeedback, loading } = useAI();
  const [feedback, setFeedback] = useState(null);
  const [loaded, setLoaded] = useState(false);
  if (!loaded && !loading) {
    setLoaded(true);
    getMotivationalFeedback(childName, missionTitle, points, totalPoints).then(setFeedback);
  }
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center">
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="text-2xl font-bold text-orange-800 mb-4">Missao Completa!</h2>
        {loading && <div className="text-orange-600 animate-pulse">IA preparando sua mensagem...</div>}
        {feedback && <p className="text-gray-700 text-base leading-relaxed mb-6">{feedback}</p>}
        <div className="bg-yellow-100 rounded-2xl p-3 mb-6">
          <p className="text-yellow-800 font-bold">+{points} pontos!</p>
          <p className="text-yellow-600 text-sm">Total: {totalPoints} pontos</p>
        </div>
        <button onClick={onClose} className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-8 rounded-2xl">
          Continuar! 🚀
        </button>
      </div>
    </div>
  );
}

export function AIDailySurprise({ child, onAddMission }) {
  const { getDailySurprise, loading, error } = useAI();
  const [surprise, setSurprise] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const handleReveal = async () => {
    const age = child.birth_date ? Math.floor((new Date() - new Date(child.birth_date)) / (365.25*24*60*60*1000)) : 8;
    const result = await getDailySurprise(child.name, age);
    if (result) { setSurprise(result); setRevealed(true); }
  };
  return (
    <div className="bg-gradient-to-br from-pink-50 to-rose-50 rounded-2xl p-5 border border-pink-200">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">🎯</span>
        <h3 className="font-bold text-pink-800 text-lg">Missao Surpresa do Dia!</h3>
      </div>
      {!revealed ? (
        <div className="text-center">
          <div className="text-5xl mb-3">🎁</div>
          <p className="text-pink-600 mb-4 text-sm">A IA preparou uma missao especial so para voce hoje!</p>
          <button onClick={handleReveal} disabled={loading}
            className="bg-pink-500 hover:bg-pink-600 text-white font-bold py-3 px-8 rounded-2xl disabled:opacity-50">
            {loading ? 'Preparando...' : '🎁 Revelar Missao!'}
          </button>
          {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
        </div>
      ) : (
        <div className="text-center">
          <div className="text-5xl mb-3">{surprise?.emoji || '⭐'}</div>
          <h4 className="font-bold text-pink-800 text-xl mb-2">{surprise?.title}</h4>
          <p className="text-gray-600 text-sm mb-3">{surprise?.description}</p>
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="bg-pink-100 text-pink-700 px-3 py-1 rounded-full text-sm">{surprise?.category}</span>
            <span className="bg-yellow-100 text-yellow-700 font-bold px-3 py-1 rounded-full text-sm">⭐ {surprise?.points} pts</span>
          </div>
          <button onClick={() => onAddMission && onAddMission(surprise)}
            className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-xl">
            Aceitar Missao! ✅
          </button>
        </div>
      )}
    </div>
  );
}
