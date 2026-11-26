import {Component, type ErrorInfo, type ReactNode} from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error
          ? String((error as {message: unknown}).message)
          : String(error);
    return {hasError: true, message};
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Erro na aplicação ZercAuto Gest:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-light-background flex items-center justify-center p-gutter-md">
          <div className="max-w-md w-full bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-lg flex flex-col gap-gutter-md">
            <h1 className="font-headline text-headline-md text-light-primary dark:text-red-400">
              Ocorreu um erro inesperado
            </h1>
            <p className="font-body text-body-md text-light-on-surface">
              Não foi possível concluir a operação na base de dados local. Pode recarregar a página
              para retomar o trabalho.
            </p>
            {this.state.message && (
              <p className="font-mono text-mono-sm text-light-on-surface-variant bg-light-surface-container-low p-gutter-sm rounded border border-light-outline-variant break-words">
                {this.state.message}
              </p>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-gutter-md py-gutter-sm rounded bg-light-primary text-light-on-primary font-label text-label-lg self-end"
            >
              Recarregar Aplicação
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
