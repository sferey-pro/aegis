import React, { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Loader2, TrendingDown } from 'lucide-react';

interface HistoryPoint {
  date: string;
  critical: number;
  high: number;
  moderate: number;
  low: number;
}

export function HistoryChart() {
  const [data, setData] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/history-global?days=${days}`)
      .then(r => r.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(e => {
        console.error(e);
        setLoading(false);
      });
  }, [days]);

  if (loading) {
    return (
      <div className="glass-panel w-full h-[400px] rounded-2xl flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="glass-panel w-full h-[400px] rounded-2xl flex flex-col items-center justify-center text-muted-foreground gap-2">
        <TrendingDown className="w-8 h-8 opacity-50" />
        <p>Aucune donnée d'historique disponible.</p>
      </div>
    );
  }

  // Custom tooltip to look nice with dark mode
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-black/90 border border-border p-4 rounded-xl shadow-xl backdrop-blur-xl">
          <p className="font-bold mb-2 text-white">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-4 text-sm font-medium">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="capitalize" style={{ color: entry.color }}>
                  {entry.name === 'critical' ? 'Critique' : 
                   entry.name === 'high' ? 'Élevé' : 
                   entry.name === 'moderate' ? 'Modéré' : 'Faible'}
                </span>
              </div>
              <span className="text-white">{entry.value}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="glass-panel w-full p-6 rounded-2xl">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold font-heading">Évolution Globale</h3>
          <p className="text-sm text-muted-foreground">Volume de vulnérabilités sur les derniers {days} jours (tous projets confondus).</p>
        </div>
        <select 
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary outline-none"
        >
          <option value={7}>7 Jours</option>
          <option value={14}>14 Jours</option>
          <option value={30}>30 Jours</option>
          <option value={60}>60 Jours</option>
          <option value={90}>90 Jours</option>
        </select>
      </div>
      
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorCritical" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorHigh" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorMod" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#eab308" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorLow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
            <XAxis dataKey="date" stroke="#ffffff50" fontSize={12} tickMargin={10} axisLine={false} tickLine={false} />
            <YAxis stroke="#ffffff50" fontSize={12} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#ffffff20', strokeWidth: 2 }} />
            <Area type="monotone" dataKey="critical" stackId="1" stroke="#ef4444" fill="url(#colorCritical)" strokeWidth={2} isAnimationActive={false} />
            <Area type="monotone" dataKey="high" stackId="1" stroke="#f97316" fill="url(#colorHigh)" strokeWidth={2} isAnimationActive={false} />
            <Area type="monotone" dataKey="moderate" stackId="1" stroke="#eab308" fill="url(#colorMod)" strokeWidth={2} isAnimationActive={false} />
            <Area type="monotone" dataKey="low" stackId="1" stroke="#3b82f6" fill="url(#colorLow)" strokeWidth={2} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
