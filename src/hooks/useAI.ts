import { useState } from 'react';
import { supabase } from '../lib/supabase';

interface Mission {
    title: string;
    description: string;
    points: number;
    category: string;
}

interface DailySurprise extends Mission {
    emoji: string;
}

export function useAI() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

  const callAI = async (type: string, data: object) => {
        setLoading(true);
        setError(null);
        try {
                const { data: result, error: fnError } = await supabase.functions.invoke('ai-assistant', {
                          body: { type, data },
                });
                if (fnError) throw fnError;
                if (!result.success) throw new Error(result.error);
                return result.result;
        } catch (err: any) {
                setError(err.message || 'Erro ao chamar IA');
                return null;
        } finally {
                setLoading(false);
        }
  };

  const suggestMissions = async (
        childName: string,
        age: number,
        completedMissions: string[] = []
      ): Promise<{ missions: Mission[] } | null> => {
        return callAI('suggest_missions', { childName, age, completedMissions });
  };

  const getMotivationalFeedback = async (
        childName: string,
        missionTitle: string,
        points: number,
        totalPoints: number
      ): Promise<string | null> => {
        return callAI('motivational_feedback', { childName, missionTitle, points, totalPoints });
  };

  const getDailySurprise = async (
        childName: string,
        age: number,
        previousMissions: string[] = []
      ): Promise<DailySurprise | null> => {
        return callAI('daily_surprise', { childName, age, previousMissions });
  };

  const getWeeklyReport = async (
        childName: string,
        age: number,
        completedMissions: string[],
        totalPoints: number,
        weekPoints: number
      ): Promise<string | null> => {
        return callAI('weekly_report', { childName, age, completedMissions, totalPoints, weekPoints });
  };

  return {
        loading,
        error,
        suggestMissions,
        getMotivationalFeedback,
        getDailySurprise,
        getWeeklyReport,
  };
}
