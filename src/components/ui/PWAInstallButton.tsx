import {Download, Share, Smartphone} from 'lucide-react';
import {useState} from 'react';
import {usePWAInstall} from '../../hooks/usePWAInstall';
import {Modal} from './Modal';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'full';
  onNotify?: (msg: string) => void;
}

export function PWAInstallButton({variant = 'compact', onNotify}: PWAInstallButtonProps) {
  const {canInstallNative, isInstalled, isIOS, promptInstall} = usePWAInstall();
  const [iosGuideOpen, setIosGuideOpen] = useState(false);

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

  const handleInstallClick = async () => {
    const result = await promptInstall();
    if (result === 'ios-guide') {
      setIosGuideOpen(true);
    } else if (result === 'accepted') {
      onNotify?.('ZercAuto Gest instalada com sucesso.');
    } else if (result === 'unavailable') {
      setIosGuideOpen(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        className={
          variant === 'full'
            ? 'inline-flex items-center justify-center gap-gutter-sm px-gutter-md py-gutter-sm min-h-[44px] bg-light-primary text-light-on-primary rounded border border-light-primary hover:bg-light-primary-container transition-colors duration-state-change font-label text-label-lg whitespace-nowrap shrink-0'
            : 'inline-flex items-center justify-center gap-gutter-xs px-gutter-sm py-gutter-xs min-h-[36px] bg-light-surface-container-lowest text-light-on-surface rounded border border-light-outline-variant hover:bg-light-surface-container transition-colors duration-state-change font-label text-label-lg whitespace-nowrap shrink-0'
        }
        title={canInstallNative ? 'Instalar ZercAuto Gest como aplicação' : 'Instruções de instalação PWA'}
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
        open={iosGuideOpen}
        onClose={() => setIosGuideOpen(false)}
        title="Instalar ZercAuto Gest (PWA)"
        subtitle={
          isIOS
            ? 'Siga os passos no Safari para adicionar ao ecrã principal'
            : 'Instalação rápida offline no navegador'
        }
      >
        <div className="flex flex-col gap-gutter-md">
          {isIOS ? (
            <ol className="flex flex-col gap-gutter-sm font-body text-body-md text-light-on-surface">
              <li className="flex items-start gap-gutter-sm">
                <span className="font-mono text-mono-md text-light-primary dark:text-red-400 font-semibold">1.</span>
                <span>
                  Toque no ícone <Share className="w-4 h-4 inline mx-1" aria-hidden="true" />{' '}
                  <strong>Partilhar</strong> na barra inferior do Safari.
                </span>
              </li>
              <li className="flex items-start gap-gutter-sm">
                <span className="font-mono text-mono-md text-light-primary dark:text-red-400 font-semibold">2.</span>
                <span>
                  Deslize e selecione <strong>&ldquo;Adicionar ao ecrã principal&rdquo;</strong>.
                </span>
              </li>
              <li className="flex items-start gap-gutter-sm">
                <span className="font-mono text-mono-md text-light-primary dark:text-red-400 font-semibold">3.</span>
                <span>
                  Confirme tocando em <strong>Adicionar</strong> para executar em modo ecrã inteiro offline.
                </span>
              </li>
            </ol>
          ) : (
            <p className="font-body text-body-md text-light-on-surface">
              Para instalar no ambiente de trabalho ou Android, utilize o ícone de instalação na barra de
              endereços do navegador ou o menu <strong>Instalar aplicação</strong>. Todos os dados são
              guardados localmente no IndexedDB para utilização sem internet.
            </p>
          )}
          <div className="flex justify-end pt-gutter-sm border-t border-light-outline-variant">
            <button
              type="button"
              onClick={() => setIosGuideOpen(false)}
              className="px-gutter-md py-gutter-sm rounded bg-light-primary text-light-on-primary font-label text-label-lg whitespace-nowrap"
            >
              Entendido
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
