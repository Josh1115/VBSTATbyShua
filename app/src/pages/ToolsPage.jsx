import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';

const TOOLS = [
  {
    to:          '/tools/serve-receive',
    icon:        '🏐',
    label:       'Serve Receive',
    description: 'Track pass ratings & APR during drills',
  },
  {
    to:          '/tools/serve-tracker',
    icon:        '🎯',
    label:       'Serve Tracker',
    description: 'Log serves by zone with net & out errors',
  },
];

export function ToolsPage() {
  const navigate = useNavigate();

  return (
    <div>
      <PageHeader title="Tools" backTo="/" />
      <div className="p-4 space-y-3">
        {TOOLS.map((tool) => (
          <button
            key={tool.to}
            onClick={() => navigate(tool.to)}
            className="group w-full card-top-glow bg-surface rounded-xl p-5 text-left flex items-center gap-4 hover:bg-slate-700 active:scale-[0.97] transition-[transform,background-color] duration-75"
          >
            <span className="text-4xl">{tool.icon}</span>
            <div className="flex-1">
              <div className="font-bold text-base">{tool.label}</div>
              <div className="text-sm text-slate-400">{tool.description}</div>
            </div>
            <span className="text-slate-500 text-xl">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
