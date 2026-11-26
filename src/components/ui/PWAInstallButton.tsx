import {AlertCircle, CheckCircle2, Download, Eye, EyeOff, Lock, Share, Smartphone} from 'lucide-react';
import {useState} from 'react';
import {usePWAInstall} from '../../hooks/usePWAInstall';
import {verifyInstallCredentials} from '../../utils/auth';
import {Modal} from './Modal';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'full';
  onNotify?: (msg: string) => void;
}

export function PWAInstallButton({variant = 'compact', onNotify}: PWAInstallButtonProps) {
  const {canInstallNative, isInstalled, isIOS, promptInstall} = usePWAInstall();
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState<'auth' | 'guide'>('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [authorizedEmail, setAuthorizedEmail] = useState<string | null>(null);

  if (isInstalled) {
    if (variant === 'full') {
      return (
        <div className="px-gutter-md py-gutter-sm rounded border border-success/30 bg-success-container text-on-success-container font-label text-label-lg inline-flex items-center gap-gutter-sm whitespace-nowrap">
          <Smartphone className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>App Instalada no Dispositivo</span>
        </div>
      );
    }
    return null;
  }

  const resetAndOpenAuthModal = () => {
    setStep('auth');
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setAuthError(null);
    setAuthorizedEmail(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setPassword('');
    setShowPassword(false);
    setAuthError(null);
  };

  const handleAuthAndInstall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verifying) return;
    setAuthError(null);
    setVerifying(true);

    try {
      const res = await verifyInstallCredentials(email, password);
      if (!res.ok) {
        setAuthError(res.error);
        return;
      }

      // Clear sensitive password immediately upon verification
      setPassword('');
      setAuthorizedEmail(res.authorizedEmail);

      if (canInstallNative) {
        const installOutcome = await promptInstall();
        if (installOutcome === 'accepted') {
          closeModal();
          onNotify?.('ZercAuto Gest instalada com sucesso.');
          return;
        }
        if (installOutcome === 'dismissed') {
          closeModal();
          onNotify?.('Instalação cancelada pelo utilizador.');
          return;
        }
      }

      setStep('guide');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={resetAndOpenAuthModal}
        className={
          variant === 'full'
            ? 'inline-flex items-center justify-center gap-gutter-sm px-gutter-md py-gutter-sm min-h-[44px] bg-light-primary text-light-on-primary rounded border border-light-primary hover:bg-light-primary-container transition-colors duration-state-change font-label text-label-lg whitespace-nowrap shrink-0'
            : 'inline-flex items-center justify-center gap-gutter-xs px-gutter-sm py-gutter-xs min-h-[36px] bg-light-surface-container-lowest text-light-on-surface rounded border border-light-outline-variant hover:bg-light-surface-container transition-colors duration-state-change font-label text-label-lg whitespace-nowrap shrink-0'
        }
        title="Autenticação do criador obrigatória para instalar ZercAuto Gest"
      >
        <Download
          className={`w-4 h-4 shrink-0 ${
            variant === 'full' ? 'text-light-on-primary' : 'text-light-primary dark:text-red-400'
          }`}
          aria-hidden="true"
        />
        <span className={variant === 'compact' ? 'hidden xl:inline' : ''}>Instalar App</span>
      </button>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={step === 'auth' ? 'Autorização de Instalação' : 'Instalar ZercAuto Gest (PWA)'}
        subtitle={
          step === 'auth'
            ? 'Insira as credenciais do criador da aplicação para prosseguir'
            : isIOS
              ? 'Siga os passos no Safari para adicionar ao ecrã principal'
              : 'Instalação rápida offline no navegador'
        }
      >
        {step === 'auth' ? (
          <form onSubmit={handleAuthAndInstall} className="flex flex-col gap-gutter-md">
            <div className="p-gutter-sm bg-light-surface-container-low border border-light-outline-variant rounded flex items-start gap-gutter-sm">
              <Lock
                className="w-4 h-4 text-light-primary dark:text-red-400 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <p className="font-body text-body-sm text-light-on-surface-variant">
                Instalação protegida: apenas o criador autorizado da aplicação pode instalar a PWA
                neste dispositivo.
              </p>
            </div>

            {authError && (
              <div
                role="alert"
                className="p-gutter-sm rounded bg-light-error-container text-light-on-error-container border border-light-error/30 flex items-center gap-gutter-sm font-body text-body-sm"
              >
                <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{authError}</span>
              </div>
            )}

            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">Email</span>
              <input
                type="email"
                required
                autoFocus
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplo.com"
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface placeholder:text-light-outline focus:outline-none focus:border-light-primary dark:focus:border-red-400"
              />
            </label>

            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">Palavra-passe</span>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full min-h-[42px] pl-gutter-sm pr-10 bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface placeholder:text-light-outline focus:outline-none focus:border-light-primary dark:focus:border-red-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-light-on-surface-variant hover:text-light-on-surface"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Eye className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </label>

            <div className="flex justify-end gap-gutter-sm pt-gutter-sm border-t border-light-outline-variant">
              <button
                type="button"
                onClick={closeModal}
                className="px-gutter-md py-gutter-sm min-h-[40px] rounded border border-light-outline-variant font-label text-label-lg text-light-on-surface hover:bg-light-surface-container"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={verifying}
                className="inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-sm min-h-[40px] rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container disabled:opacity-60 font-label text-label-lg whitespace-nowrap"
              >
                <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{verifying ? 'A validar...' : 'Validar e Instalar'}</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-gutter-md">
            {authorizedEmail && (
              <div className="p-gutter-sm rounded bg-success-container text-on-success-container flex items-center gap-gutter-sm font-body text-body-sm">
                <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>
                  Instalação autorizada para <strong>{authorizedEmail}</strong>.
                </span>
              </div>
            )}

            {isIOS ? (
              <ol className="flex flex-col gap-gutter-sm font-body text-body-md text-light-on-surface">
                <li className="flex items-start gap-gutter-sm">
                  <span className="font-mono text-mono-md text-light-primary dark:text-red-400 font-semibold">
                    1.
                  </span>
                  <span>
                    Toque no ícone <Share className="w-4 h-4 inline mx-1" aria-hidden="true" />{' '}
                    <strong>Partilhar</strong> na barra inferior do Safari.
                  </span>
                </li>
                <li className="flex items-start gap-gutter-sm">
                  <span className="font-mono text-mono-md text-light-primary dark:text-red-400 font-semibold">
                    2.
                  </span>
                  <span>
                    Deslize e selecione <strong>&ldquo;Adicionar ao ecrã principal&rdquo;</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-gutter-sm">
                  <span className="font-mono text-mono-md text-light-primary dark:text-red-400 font-semibold">
                    3.
                  </span>
                  <span>
                    Confirme tocando em <strong>Adicionar</strong> para executar em modo ecrã inteiro
                    offline.
                  </span>
                </li>
              </ol>
            ) : (
              <p className="font-body text-body-md text-light-on-surface">
                Para instalar no ambiente de trabalho ou Android, utilize o ícone de instalação na
                barra de endereços do navegador ou o menu <strong>Instalar aplicação</strong>. Todos
                os dados são guardados localmente no IndexedDB para utilização sem internet.
              </p>
            )}
            <div className="flex justify-end pt-gutter-sm border-t border-light-outline-variant">
              <button
                type="button"
                onClick={closeModal}
                className="px-gutter-md py-gutter-sm rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container font-label text-label-lg whitespace-nowrap"
              >
                Concluir
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
