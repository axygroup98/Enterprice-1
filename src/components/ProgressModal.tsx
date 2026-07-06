import { CheckCircle, XCircle, Loader2, X } from 'lucide-react';

export interface ProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'success' | 'error';
  detail?: string;
}

interface Props {
  open: boolean;
  title: string;
  steps: ProgressStep[];
  onClose?: () => void;
  summary?: string;
  finished?: boolean;
}

export function ProgressModal({ open, title, steps, onClose, summary, finished }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg border border-gray-100">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          {finished && onClose && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="p-6 space-y-3 max-h-80 overflow-y-auto">
          {steps.map((step) => (
            <div key={step.id} className="flex items-start gap-3">
              <div className="mt-0.5 flex-shrink-0">
                {step.status === 'success' && <CheckCircle className="h-5 w-5 text-green-500" />}
                {step.status === 'error' && <XCircle className="h-5 w-5 text-red-500" />}
                {step.status === 'running' && <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />}
                {step.status === 'pending' && <div className="h-5 w-5 rounded-full border-2 border-gray-200" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${step.status === 'pending' ? 'text-gray-400' : 'text-gray-900'}`}>
                  {step.label}
                </p>
                {step.detail && (
                  <p className={`text-xs mt-0.5 ${step.status === 'error' ? 'text-red-600' : 'text-gray-500'}`}>
                    {step.detail}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
        {summary && finished && (
          <div className="px-6 pb-6">
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <p className="text-sm text-gray-700 whitespace-pre-line font-medium">{summary}</p>
            </div>
          </div>
        )}
        {finished && onClose && (
          <div className="px-6 pb-6 flex justify-end border-t border-gray-100 pt-4">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors"
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
