import {Lock, MonitorSmartphone, ShieldCheck, UserPlus, Users} from 'lucide-react';
import {useState} from 'react';
import {newUuid, saveWorkshopUser} from '../db/dexie';
import type {ModulePermission, UserRole, WorkshopUser} from '../types/database';
import {Modal} from '../components/ui/Modal';

interface UtilizadoresAcessoPageProps {
  users: WorkshopUser[];
  currentUserId: string;
  onNotify: (msg: string) => void;
}

const ROLE_OPTIONS: UserRole[] = [
  'Mecânico',
  'Mecânico Sénior',
  'Chefe de Oficina',
  'Receção & Faturação',
  'Contabilidade',
  'Administrador',
  'Estagiário',
];

const PERMISSION_LABELS: Array<{id: ModulePermission; label: string}> = [
  {id: 'work_orders', label: 'Criar e editar Folhas de Obra'},
  {id: 'stock', label: 'Movimentar Stock & Peças'},
  {id: 'payments', label: 'Registar Pagamentos e Relatórios Mensais'},
  {id: 'users', label: 'Gerir Utilizadores e Credenciais'},
];

export function UtilizadoresAcessoPage({
  users,
  currentUserId,
  onNotify,
}: UtilizadoresAcessoPageProps) {
  // New Credential Form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('Mecânico');
  const [tempPassword, setTempPassword] = useState('');
  const [permissions, setPermissions] = useState<ModulePermission[]>(['work_orders']);

  // Edit User Modal
  const [editingUser, setEditingUser] = useState<WorkshopUser | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('Mecânico');
  const [editPermissions, setEditPermissions] = useState<ModulePermission[]>([]);

  const activeOfflineSessions = users.filter(
    (u) => u.active && u.sessionState !== 'Suspenso'
  ).length;
  const suspendedCount = users.filter((u) => !u.active || u.sessionState === 'Suspenso').length;

  const togglePermission = (perm: ModulePermission, list: ModulePermission[]) =>
    list.includes(perm) ? list.filter((p) => p !== perm) : [...list, perm];

  const handleIssueCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    const newUser: WorkshopUser = {
      id: newUuid(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role,
      sessionState: 'Offline Cache',
      permissions: permissions.length > 0 ? permissions : ['work_orders'],
      active: true,
      updatedAt: new Date().toISOString(),
    };

    await saveWorkshopUser(newUser);
    setName('');
    setEmail('');
    setTempPassword('');
    setPermissions(['work_orders']);
    onNotify(`Credencial emitida para ${newUser.name} (${newUser.role}).`);
  };

  const handleUserAction = async (user: WorkshopUser) => {
    if (user.id === currentUserId) {
      setEditingUser(user);
      setEditRole(user.role);
      setEditPermissions(user.permissions);
      return;
    }
    if (!user.active || user.sessionState === 'Suspenso') {
      await saveWorkshopUser({...user, active: true, sessionState: 'Online'});
      onNotify(`Acesso de ${user.name} reativado.`);
    } else {
      await saveWorkshopUser({...user, active: false, sessionState: 'Suspenso'});
      onNotify(`Sessão de ${user.name} terminada e acesso suspenso.`);
    }
  };

  const handleSaveEditedUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    await saveWorkshopUser({
      ...editingUser,
      role: editRole,
      permissions: editPermissions,
    });
    setEditingUser(null);
    onNotify(`Perfil de ${editingUser.name} atualizado.`);
  };

  const getSessionBadgeStyle = (user: WorkshopUser) => {
    if (!user.active || user.sessionState === 'Suspenso') {
      return 'bg-light-error-container text-light-on-error-container';
    }
    if (user.sessionState === 'Ativa (Atual)' || user.sessionState === 'Online') {
      return 'bg-success-container text-on-success-container';
    }
    return 'bg-light-secondary-container text-light-on-secondary-container';
  };

  return (
    <div className="flex flex-col gap-gutter-lg">
      {/* 3 Summary KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-gutter-md">
        <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex items-center justify-between gap-gutter-sm">
          <div className="flex flex-col gap-gutter-xs">
            <span className="font-label text-label-lg text-light-on-surface-variant">
              Utilizadores Credenciados
            </span>
            <p className="font-display text-headline-lg text-light-on-surface tabular-nums">
              {users.length}
            </p>
          </div>
          <Users className="w-6 h-6 text-light-outline shrink-0" aria-hidden="true" />
        </article>

        <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex items-center justify-between gap-gutter-sm">
          <div className="flex flex-col gap-gutter-xs">
            <span className="font-label text-label-lg text-light-on-surface-variant">
              Sessões Offline Ativas
            </span>
            <p className="font-display text-headline-lg text-light-on-surface tabular-nums">
              {activeOfflineSessions} dispositivos
            </p>
          </div>
          <MonitorSmartphone className="w-6 h-6 text-success shrink-0" aria-hidden="true" />
        </article>

        <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex items-center justify-between gap-gutter-sm">
          <div className="flex flex-col gap-gutter-xs">
            <span className="font-label text-label-lg text-light-on-surface-variant">
              Acessos Suspensos
            </span>
            <p className="font-display text-headline-lg text-light-error tabular-nums">
              {suspendedCount}
            </p>
          </div>
          <Lock className="w-6 h-6 text-light-error shrink-0" aria-hidden="true" />
        </article>
      </section>

      {/* Split Layout: Equipa Credenciada (7 cols) + Nova Credencial (5 cols) */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-gutter-lg items-start">
        <div className="xl:col-span-7 bg-light-surface-container-lowest border border-light-outline-variant rounded-lg overflow-hidden min-w-0">
          <header className="px-gutter-md py-gutter-sm bg-light-surface-container-low border-b border-light-outline-variant flex items-center justify-between gap-gutter-sm">
            <h2 className="font-headline text-title-md text-light-on-surface">
              Equipa Credenciada
            </h2>
            <span className="inline-flex items-center gap-1 font-label text-label-sm text-light-on-surface-variant">
              <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{users.length} perfis</span>
            </span>
          </header>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-light-surface-container-low border-b border-light-outline-variant">
                <tr>
                  <th className="px-gutter-sm py-gutter-sm font-label text-label-sm text-light-on-surface-variant uppercase">
                    Utilizador
                  </th>
                  <th className="px-gutter-sm py-gutter-sm font-label text-label-sm text-light-on-surface-variant uppercase">
                    Perfil
                  </th>
                  <th className="px-gutter-sm py-gutter-sm font-label text-label-sm text-light-on-surface-variant uppercase">
                    Sessão
                  </th>
                  <th className="px-gutter-sm py-gutter-sm font-label text-label-sm text-light-on-surface-variant uppercase text-right">
                    Ação
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-light-outline-variant">
                {users.map((u) => {
                  const isCurrent = u.id === currentUserId;
                  const isSuspended = !u.active || u.sessionState === 'Suspenso';
                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-light-surface-container-low/60 transition-colors duration-state-change"
                    >
                      <td className="px-gutter-sm py-gutter-sm">
                        <div className="flex flex-col">
                          <span className="font-label text-label-lg text-light-on-surface">
                            {u.name}
                          </span>
                          <span className="font-mono text-mono-sm text-light-on-surface-variant">
                            {u.email}
                          </span>
                        </div>
                      </td>
                      <td className="px-gutter-sm py-gutter-sm font-body text-body-sm text-light-on-surface whitespace-nowrap">
                        {u.role}
                      </td>
                      <td className="px-gutter-sm py-gutter-sm whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-gutter-sm py-0.5 rounded font-label text-label-sm ${getSessionBadgeStyle(
                            u
                          )}`}
                        >
                          {isSuspended ? 'Suspenso' : u.sessionState}
                        </span>
                      </td>
                      <td className="px-gutter-sm py-gutter-sm text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-gutter-xs">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingUser(u);
                              setEditRole(u.role);
                              setEditPermissions(u.permissions);
                            }}
                            className="px-2 py-1 rounded border border-light-outline-variant hover:bg-light-surface-container font-label text-label-sm text-light-on-surface"
                          >
                            Editar
                          </button>
                          {!isCurrent && (
                            <button
                              type="button"
                              onClick={() => handleUserAction(u)}
                              className={`px-2 py-1 rounded border font-label text-label-sm ${
                                isSuspended
                                  ? 'border-success/40 text-success hover:bg-success-container'
                                  : 'border-light-error/30 text-light-error hover:bg-light-error-container'
                              }`}
                            >
                              {isSuspended ? 'Reativar' : 'Forçar Logout'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Nova Credencial de Acesso Form */}
        <article className="xl:col-span-5 bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex flex-col gap-gutter-md min-w-0">
          <header className="flex flex-col gap-0.5 pb-gutter-sm border-b border-light-outline-variant">
            <h2 className="font-headline text-title-md text-light-on-surface">
              Nova Credencial de Acesso
            </h2>
            <p className="font-body text-body-sm text-light-on-surface-variant">
              Regista perfil local/Supabase Auth e atribui permissões na oficina
            </p>
          </header>

          <form onSubmit={handleIssueCredential} className="flex flex-col gap-gutter-md">
            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">Nome completo</span>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: António Sebastião"
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-md text-light-on-surface"
              />
            </label>

            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">
                Email de acesso
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@zercauto.ao"
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface"
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-gutter-sm">
              <label className="flex flex-col gap-gutter-xs">
                <span className="font-label text-label-lg text-light-on-surface">
                  Perfil / Função
                </span>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-md text-light-on-surface"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-gutter-xs">
                <span className="font-label text-label-lg text-light-on-surface">
                  Senha temporária
                </span>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={tempPassword}
                  onChange={(e) => setTempPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface"
                />
              </label>
            </div>

            <div className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">
                Permissões de Módulo
              </span>
              <div className="flex flex-col gap-gutter-xs p-gutter-sm bg-light-surface-container-low border border-light-outline-variant rounded">
                {PERMISSION_LABELS.map((perm) => (
                  <label key={perm.id} className="flex items-center gap-gutter-sm cursor-pointer py-0.5">
                    <input
                      type="checkbox"
                      checked={permissions.includes(perm.id)}
                      onChange={() => setPermissions((prev) => togglePermission(perm.id, prev))}
                      className="rounded border-light-outline text-light-primary focus:ring-light-primary"
                    />
                    <span className="font-body text-body-sm text-light-on-surface">
                      {perm.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-gutter-sm px-gutter-md py-gutter-sm min-h-[42px] rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container font-label text-label-lg"
            >
              <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Emitir Credencial</span>
            </button>
          </form>
        </article>
      </section>

      {/* Modal: Editar Utilizador */}
      <Modal
        open={Boolean(editingUser)}
        onClose={() => setEditingUser(null)}
        title="Editar Perfil e Permissões"
        subtitle={editingUser ? `${editingUser.name} · ${editingUser.email}` : undefined}
      >
        {editingUser && (
          <form onSubmit={handleSaveEditedUser} className="flex flex-col gap-gutter-md">
            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">
                Perfil / Função
              </span>
              <select
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as UserRole)}
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-md text-light-on-surface"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">
                Permissões de Módulo
              </span>
              <div className="flex flex-col gap-gutter-xs p-gutter-sm bg-light-surface-container-low border border-light-outline-variant rounded">
                {PERMISSION_LABELS.map((perm) => (
                  <label key={perm.id} className="flex items-center gap-gutter-sm cursor-pointer py-0.5">
                    <input
                      type="checkbox"
                      checked={editPermissions.includes(perm.id)}
                      onChange={() =>
                        setEditPermissions((prev) => togglePermission(perm.id, prev))
                      }
                      className="rounded border-light-outline text-light-primary focus:ring-light-primary"
                    />
                    <span className="font-body text-body-sm text-light-on-surface">
                      {perm.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-gutter-sm pt-gutter-sm border-t border-light-outline-variant">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="px-gutter-md py-gutter-sm rounded border border-light-outline-variant font-label text-label-lg text-light-on-surface"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-gutter-md py-gutter-sm rounded bg-light-primary text-light-on-primary font-label text-label-lg"
              >
                Guardar Alterações
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
