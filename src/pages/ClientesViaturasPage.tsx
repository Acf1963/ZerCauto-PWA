import {Car, Edit3, FileSpreadsheet, FileText, Plus, Search, UserPlus} from 'lucide-react';
import {useMemo, useState} from 'react';
import {newUuid, saveClient, saveVehicle} from '../db/dexie';
import type {Client, CurrencyCode, Vehicle, WorkOrder, WorkshopSettings} from '../types/database';
import {DEFAULT_SETTINGS} from '../db/seed';
import {
  formatCurrency,
  formatNumberPT,
  formatTodayPT,
  getWorkOrderStatusStyle,
} from '../utils/formatters';
import {Modal} from '../components/ui/Modal';

interface ClientesViaturasPageProps {
  clients: Client[];
  vehicles: Vehicle[];
  workOrders: WorkOrder[];
  currency: CurrencyCode;
  settings?: WorkshopSettings;
  onNotify: (msg: string) => void;
}

export function ClientesViaturasPage({
  clients,
  vehicles,
  workOrders,
  currency,
  settings = DEFAULT_SETTINGS,
  onNotify,
}: ClientesViaturasPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string>(clients[0]?.id ?? '');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  // Modals
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);

  // Client form
  const [cName, setCName] = useState('');
  const [cNif, setCNif] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cAddress, setCAddress] = useState('');
  const [cNotes, setCNotes] = useState('');

  // Vehicle form
  const [vPlate, setVPlate] = useState('');
  const [vBrand, setVBrand] = useState('');
  const [vModel, setVModel] = useState('');
  const [vYear, setVYear] = useState('2022');
  const [vVin, setVVin] = useState('');
  const [vMileage, setVMileage] = useState('0');

  const filteredClients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => {
      const clientVehs = vehicles.filter((v) => v.clientId === c.id);
      const matchClient =
        c.name.toLowerCase().includes(q) ||
        c.nif.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q);
      const matchPlate = clientVehs.some(
        (v) => v.plate.toLowerCase().includes(q) || `${v.brand} ${v.model}`.toLowerCase().includes(q)
      );
      return matchClient || matchPlate;
    });
  }, [clients, vehicles, searchQuery]);

  const activeClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) ?? filteredClients[0] ?? null,
    [clients, filteredClients, selectedClientId]
  );

  const activeClientVehicles = useMemo(
    () => (activeClient ? vehicles.filter((v) => v.clientId === activeClient.id) : []),
    [vehicles, activeClient]
  );

  const inspectedVehicle = useMemo(() => {
    if (!activeClientVehicles.length) return null;
    return (
      activeClientVehicles.find((v) => v.id === selectedVehicleId) ?? activeClientVehicles[0]
    );
  }, [activeClientVehicles, selectedVehicleId]);

  const vehicleHistory = useMemo(() => {
    if (!activeClient) return [];
    return workOrders.filter((wo) => {
      if (inspectedVehicle) {
        return wo.vehicleId === inspectedVehicle.id;
      }
      return wo.clientId === activeClient.id;
    });
  }, [workOrders, activeClient, inspectedVehicle]);

  const openNewClientModal = () => {
    setEditingClient(null);
    setCName('');
    setCNif('');
    setCPhone('+244 ');
    setCEmail('');
    setCAddress('');
    setCNotes('');
    setClientModalOpen(true);
  };

  const openEditClientModal = (client: Client) => {
    setEditingClient(client);
    setCName(client.name);
    setCNif(client.nif);
    setCPhone(client.phone);
    setCEmail(client.email);
    setCAddress(client.address);
    setCNotes(client.notes);
    setClientModalOpen(true);
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cName.trim() || !cNif.trim()) return;

    const payload: Client = editingClient
      ? {
          ...editingClient,
          name: cName.trim(),
          nif: cNif.trim(),
          phone: cPhone.trim(),
          email: cEmail.trim(),
          address: cAddress.trim(),
          notes: cNotes.trim(),
          updatedAt: new Date().toISOString(),
        }
      : {
          id: newUuid(),
          name: cName.trim(),
          nif: cNif.trim(),
          phone: cPhone.trim(),
          email: cEmail.trim(),
          address: cAddress.trim(),
          notes: cNotes.trim(),
          createdAt: formatTodayPT(),
          updatedAt: new Date().toISOString(),
        };

    await saveClient(payload);
    setSelectedClientId(payload.id);
    setClientModalOpen(false);
    onNotify(
      editingClient
        ? `Ficha de ${payload.name} atualizada.`
        : `Cliente ${payload.name} registado com sucesso.`
    );
  };

  const openNewVehicleModal = () => {
    setVPlate('');
    setVBrand('');
    setVModel('');
    setVYear('2023');
    setVVin('');
    setVMileage('0');
    setVehicleModalOpen(true);
  };

  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClient || !vPlate.trim() || !vBrand.trim() || !vModel.trim()) return;

    const payload: Vehicle = {
      id: newUuid(),
      clientId: activeClient.id,
      plate: vPlate.trim().toUpperCase(),
      brand: vBrand.trim(),
      model: vModel.trim(),
      year: Number(vYear) || 2022,
      vin: vVin.trim().toUpperCase(),
      mileage: Number(vMileage) || 0,
      updatedAt: new Date().toISOString(),
    };

    await saveVehicle(payload);
    setSelectedVehicleId(payload.id);
    setVehicleModalOpen(false);
    onNotify(`Viatura ${payload.plate} associada a ${activeClient.name}.`);
  };

  return (
    <section className="grid grid-cols-1 xl:grid-cols-12 gap-gutter-lg items-start">
      {/* Left Directory (5 cols) */}
      <div className="xl:col-span-5 flex flex-col gap-gutter-md min-w-0">
        <div className="flex flex-wrap items-center gap-gutter-sm">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              className="w-4 h-4 text-light-outline absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquisar nome, NIF ou matrícula..."
              className="w-full min-h-[42px] pl-9 pr-3 py-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-md text-light-on-surface placeholder:text-light-outline focus:outline-none focus:border-light-primary"
            />
          </div>

          <button
            type="button"
            onClick={async () => {
              const {exportClientsVehiclesXlsx} = await import('../utils/exporters');
              exportClientsVehiclesXlsx(clients, vehicles);
              onNotify('Base de clientes e viaturas exportada para Excel (.xlsx).');
            }}
            className="inline-flex items-center justify-center gap-gutter-xs px-gutter-sm py-gutter-sm min-h-[42px] rounded border border-light-outline-variant bg-light-surface-container-lowest hover:bg-light-surface-container font-label text-label-lg text-light-on-surface whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>XLSX</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              const {exportCustomTablePdf} = await import('../utils/exporters');
              const headers = ['Cliente', 'NIF', 'Telefone', 'Email', 'Morada', 'Viaturas'];
              const rows = filteredClients.map((c) => {
                const clientVehs = vehicles.filter((v) => v.clientId === c.id);
                const vehsStr = clientVehs.map((v) => `${v.plate} (${v.brand} ${v.model})`).join(', ');
                return [c.name, c.nif, c.phone, c.email || '-', c.address || '-', vehsStr || 'Sem viaturas'];
              });
              await exportCustomTablePdf(
                'Diretório de Clientes & Viaturas',
                `Total de clientes filtrados: ${filteredClients.length}`,
                headers,
                rows,
                settings,
                'zercauto-clientes-viaturas.pdf'
              );
              onNotify('Diretório de clientes exportado para PDF.');
            }}
            className="inline-flex items-center justify-center gap-gutter-xs px-gutter-sm py-gutter-sm min-h-[42px] rounded border border-light-outline-variant bg-light-surface-container-lowest hover:bg-light-surface-container font-label text-label-lg text-light-on-surface whitespace-nowrap shrink-0"
          >
            <FileText className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>PDF</span>
          </button>

          <button
            type="button"
            onClick={openNewClientModal}
            className="inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-sm min-h-[42px] rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container font-label text-label-lg whitespace-nowrap shrink-0"
          >
            <UserPlus className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Novo Cliente</span>
          </button>
        </div>

        <div className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg overflow-hidden divide-y divide-light-outline-variant">
          {filteredClients.length === 0 ? (
            <div className="p-gutter-lg text-center font-body text-body-sm text-light-on-surface-variant">
              Nenhum cliente encontrado para a pesquisa atual.
            </div>
          ) : (
            filteredClients.map((client) => {
              const clientVehs = vehicles.filter((v) => v.clientId === client.id);
              const isSelected = activeClient?.id === client.id;
              return (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => {
                    setSelectedClientId(client.id);
                    setSelectedVehicleId(null);
                  }}
                  className={`w-full text-left p-gutter-md flex items-start justify-between gap-gutter-sm transition-colors duration-state-change ${
                    isSelected
                      ? 'bg-light-surface-container-low'
                      : 'hover:bg-light-surface-container-low/60'
                  }`}
                >
                  <div className="flex flex-col gap-gutter-xs min-w-0">
                    <span
                      className={`font-title text-title-md truncate ${
                        isSelected ? 'text-light-primary dark:text-red-400' : 'text-light-on-surface'
                      }`}
                    >
                      {client.name}
                    </span>
                    <span className="font-mono text-mono-sm text-light-on-surface-variant">
                      NIF: {client.nif} · {client.phone}
                    </span>
                    <div className="font-mono text-mono-sm text-light-on-surface">
                      {clientVehs.length === 0
                        ? 'Sem viaturas'
                        : clientVehs.length <= 2
                          ? clientVehs.map((v) => v.plate).join(' · ')
                          : `${clientVehs[0].plate} · +${clientVehs.length - 1} frota`}
                    </div>
                  </div>
                  <span className="font-label text-label-sm text-light-on-surface-variant whitespace-nowrap shrink-0 tabular-nums">
                    {clientVehs.length} {clientVehs.length === 1 ? 'viatura' : 'viaturas'}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right Profile, Vehicles & Chronological History (7 cols) */}
      <div className="xl:col-span-7 flex flex-col gap-gutter-md min-w-0">
        {activeClient && (
          <>
            {/* Client Profile Card */}
            <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg p-gutter-md flex flex-col gap-gutter-md">
              <header className="flex flex-wrap items-start justify-between gap-gutter-sm pb-gutter-sm border-b border-light-outline-variant">
                <div className="flex flex-col gap-1 min-w-0">
                  <h2 className="font-headline text-headline-md text-light-on-surface">
                    {activeClient.name}
                  </h2>
                  <p className="font-mono text-mono-sm text-light-on-surface-variant">
                    NIF: {activeClient.nif} · Tel: {activeClient.phone}
                    {activeClient.email ? ` · ${activeClient.email}` : ''}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-gutter-sm shrink-0">
                  <button
                    type="button"
                    onClick={async () => {
                      const {exportCustomTablePdf} = await import('../utils/exporters');
                      const headers = ['FO Code', 'Data', 'Viatura', 'Estado', 'Pagamento', `Total (${currency})`];
                      const rows = vehicleHistory.map((wo) => [
                        wo.code,
                        wo.openedAt,
                        `${wo.vehiclePlate} (${wo.vehicleLabel})`,
                        wo.status,
                        wo.paymentStatus,
                        formatCurrency(wo.total, currency),
                      ]);
                      await exportCustomTablePdf(
                        `Histórico de Intervenções - ${activeClient.name} (NIF: ${activeClient.nif})`,
                        `Total de intervenções: ${vehicleHistory.length}`,
                        headers,
                        rows,
                        settings,
                        `zercauto-historico-${activeClient.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
                      );
                      onNotify(`PDF do histórico de ${activeClient.name} gerado com sucesso.`);
                    }}
                    className="inline-flex items-center gap-gutter-xs px-gutter-sm py-1.5 min-h-[36px] rounded border border-light-outline-variant hover:bg-light-surface-container font-label text-label-lg text-light-on-surface whitespace-nowrap"
                  >
                    <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Gerar PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditClientModal(activeClient)}
                    className="inline-flex items-center gap-gutter-xs px-gutter-sm py-1.5 min-h-[36px] rounded border border-light-outline-variant hover:bg-light-surface-container font-label text-label-lg text-light-on-surface whitespace-nowrap"
                  >
                    <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Editar Cliente</span>
                  </button>
                  <button
                    type="button"
                    onClick={openNewVehicleModal}
                    className="inline-flex items-center gap-gutter-xs px-gutter-sm py-1.5 min-h-[36px] rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container font-label text-label-lg whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Nova Viatura</span>
                  </button>
                </div>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter-md">
                <div className="flex flex-col gap-1">
                  <span className="font-label text-label-sm uppercase text-light-on-surface-variant">
                    Morada
                  </span>
                  <p className="font-body text-body-md text-light-on-surface">
                    {activeClient.address || 'Sem morada registada'}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-label text-label-sm uppercase text-light-on-surface-variant">
                    Notas da Oficina
                  </span>
                  <p className="font-body text-body-md text-light-on-surface">
                    {activeClient.notes || 'Sem observações registadas.'}
                  </p>
                </div>
              </div>

              {/* Associated Vehicles */}
              <div className="flex flex-col gap-gutter-sm pt-gutter-sm border-t border-light-outline-variant">
                <h3 className="font-label text-label-sm uppercase text-light-on-surface-variant">
                  Viaturas Associadas
                </h3>

                {activeClientVehicles.length === 0 ? (
                  <p className="font-body text-body-sm text-light-on-surface-variant">
                    Este cliente ainda não tem viaturas associadas.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-gutter-sm">
                    {activeClientVehicles.map((veh) => {
                      const activeVeh = inspectedVehicle?.id === veh.id;
                      return (
                        <button
                          key={veh.id}
                          type="button"
                          onClick={() => setSelectedVehicleId(veh.id)}
                          className={`text-left p-gutter-sm rounded border transition-colors duration-state-change flex flex-col gap-1 ${
                            activeVeh
                              ? 'border-light-primary dark:border-red-400 bg-light-surface-container-low'
                              : 'border-light-outline-variant bg-light-surface-container-lowest hover:bg-light-surface-container-low/60'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-gutter-sm">
                            <span className="font-mono text-title-md text-light-primary dark:text-red-400 font-semibold">
                              {veh.plate}
                            </span>
                            <span className="font-mono text-mono-sm text-light-on-surface-variant tabular-nums">
                              {formatNumberPT(veh.mileage)} km
                            </span>
                          </div>
                          <span className="font-label text-label-lg text-light-on-surface">
                            {veh.brand} {veh.model} ({veh.year})
                          </span>
                          <span className="font-mono text-mono-sm text-light-on-surface-variant truncate">
                            VIN: {veh.vin || 'N/D'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </article>

            {/* Chronological Service History */}
            <article className="bg-light-surface-container-lowest border border-light-outline-variant rounded-lg overflow-hidden">
              <header className="px-gutter-md py-gutter-sm bg-light-surface-container-low border-b border-light-outline-variant flex items-center justify-between gap-gutter-sm">
                <div className="flex items-center gap-gutter-sm min-w-0">
                  <Car className="w-4 h-4 text-light-primary dark:text-red-400 shrink-0" aria-hidden="true" />
                  <h3 className="font-headline text-title-md text-light-on-surface truncate">
                    Histórico Cronológico de Serviços
                  </h3>
                </div>
                {inspectedVehicle && (
                  <span className="font-mono text-mono-sm text-light-on-surface-variant whitespace-nowrap">
                    {inspectedVehicle.brand} {inspectedVehicle.model} · {inspectedVehicle.plate} ·{' '}
                    {vehicleHistory.length}{' '}
                    {vehicleHistory.length === 1 ? 'intervenção' : 'intervenções'}
                  </span>
                )}
              </header>

              {vehicleHistory.length === 0 ? (
                <div className="p-gutter-lg text-center font-body text-body-sm text-light-on-surface-variant">
                  Sem intervenções registadas para esta viatura.
                </div>
              ) : (
                <div className="divide-y divide-light-outline-variant">
                  {vehicleHistory.map((wo) => (
                    <div key={wo.id} className="p-gutter-md flex flex-col gap-gutter-xs">
                      <div className="flex flex-wrap items-center justify-between gap-gutter-sm">
                        <div className="flex items-center gap-gutter-sm">
                          <span className="font-mono text-mono-md text-light-primary dark:text-red-400 font-semibold">
                            {wo.code}
                          </span>
                          <span className="font-mono text-mono-sm text-light-on-surface-variant tabular-nums">
                            {wo.openedAt} · {formatNumberPT(wo.mileage)} km
                          </span>
                        </div>
                        <span
                          className={`px-gutter-sm py-0.5 rounded font-label text-label-sm whitespace-nowrap ${getWorkOrderStatusStyle(
                            wo.status
                          )}`}
                        >
                          {wo.status} · {wo.paymentStatus}
                        </span>
                      </div>

                      <p className="font-body text-body-md text-light-on-surface">{wo.diagnosis}</p>

                      <div className="flex items-center justify-between gap-gutter-sm pt-1 text-body-sm text-light-on-surface-variant">
                        <span>
                          {wo.labor[0]
                            ? `Mecânico: ${wo.labor[0].technicianName} (${formatNumberPT(
                                wo.labor.reduce((a, b) => a + b.hours, 0),
                                1
                              )}h)`
                            : 'Equipa ZercAuto'}
                          {wo.paymentMethod ? ` · ${wo.paymentMethod}` : ''}
                        </span>
                        <span className="font-mono text-mono-md text-light-on-surface font-semibold tabular-nums whitespace-nowrap">
                          {formatCurrency(wo.total, currency, {decimals: 2})}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </>
        )}
      </div>

      {/* Modal: Novo / Editar Cliente */}
      <Modal
        open={clientModalOpen}
        onClose={() => setClientModalOpen(false)}
        title={editingClient ? 'Editar Ficha de Cliente' : 'Novo Cliente'}
        subtitle="Dados fiscais e de contacto para faturação e folhas de obra"
      >
        <form onSubmit={handleSaveClient} className="flex flex-col gap-gutter-md">
          <label className="flex flex-col gap-gutter-xs">
            <span className="font-label text-label-lg text-light-on-surface">
              Nome Completo / Empresa
            </span>
            <input
              type="text"
              required
              value={cName}
              onChange={(e) => setCName(e.target.value)}
              placeholder="Ex.: Carlos Manuel"
              className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-md text-light-on-surface"
            />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-gutter-sm">
            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">NIF</span>
              <input
                type="text"
                required
                value={cNif}
                onChange={(e) => setCNif(e.target.value)}
                placeholder="5417029184"
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface"
              />
            </label>
            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">Telefone</span>
              <input
                type="tel"
                required
                value={cPhone}
                onChange={(e) => setCPhone(e.target.value)}
                placeholder="+244 923 410 812"
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface"
              />
            </label>
          </div>
          <label className="flex flex-col gap-gutter-xs">
            <span className="font-label text-label-lg text-light-on-surface">Email</span>
            <input
              type="email"
              value={cEmail}
              onChange={(e) => setCEmail(e.target.value)}
              placeholder="cliente@email.ao"
              className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-md text-light-on-surface"
            />
          </label>
          <label className="flex flex-col gap-gutter-xs">
            <span className="font-label text-label-lg text-light-on-surface">Morada</span>
            <input
              type="text"
              value={cAddress}
              onChange={(e) => setCAddress(e.target.value)}
              placeholder="Rua, Nº, Município"
              className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-md text-light-on-surface"
            />
          </label>
          <label className="flex flex-col gap-gutter-xs">
            <span className="font-label text-label-lg text-light-on-surface">
              Notas da Oficina
            </span>
            <textarea
              rows={2}
              value={cNotes}
              onChange={(e) => setCNotes(e.target.value)}
              className="w-full p-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-md text-light-on-surface"
            />
          </label>
          <div className="flex justify-end gap-gutter-sm pt-gutter-sm border-t border-light-outline-variant">
            <button
              type="button"
              onClick={() => setClientModalOpen(false)}
              className="px-gutter-md py-gutter-sm rounded border border-light-outline-variant font-label text-label-lg text-light-on-surface"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-gutter-md py-gutter-sm rounded bg-light-primary text-light-on-primary font-label text-label-lg"
            >
              Guardar Cliente
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Nova Viatura */}
      <Modal
        open={vehicleModalOpen}
        onClose={() => setVehicleModalOpen(false)}
        title="Nova Viatura"
        subtitle={activeClient ? `Associar viatura a ${activeClient.name}` : undefined}
      >
        <form onSubmit={handleSaveVehicle} className="flex flex-col gap-gutter-md">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-gutter-sm">
            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">Matrícula</span>
              <input
                type="text"
                required
                value={vPlate}
                onChange={(e) => setVPlate(e.target.value)}
                placeholder="LD-42-88-AB"
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md uppercase text-light-on-surface"
              />
            </label>
            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">Ano</span>
              <input
                type="number"
                required
                min={1970}
                max={2030}
                value={vYear}
                onChange={(e) => setVYear(e.target.value)}
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface"
              />
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-gutter-sm">
            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">Marca</span>
              <input
                type="text"
                required
                value={vBrand}
                onChange={(e) => setVBrand(e.target.value)}
                placeholder="Toyota"
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-md text-light-on-surface"
              />
            </label>
            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">Modelo</span>
              <input
                type="text"
                required
                value={vModel}
                onChange={(e) => setVModel(e.target.value)}
                placeholder="Hilux 2.4 D-4D"
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-body text-body-md text-light-on-surface"
              />
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-gutter-sm">
            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">
                VIN / Chassis
              </span>
              <input
                type="text"
                value={vVin}
                onChange={(e) => setVVin(e.target.value)}
                placeholder="AHTFB8CD..."
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md uppercase text-light-on-surface"
              />
            </label>
            <label className="flex flex-col gap-gutter-xs">
              <span className="font-label text-label-lg text-light-on-surface">
                Quilometragem (km)
              </span>
              <input
                type="number"
                min={0}
                value={vMileage}
                onChange={(e) => setVMileage(e.target.value)}
                className="w-full min-h-[42px] px-gutter-sm bg-light-surface-container-lowest border border-light-outline-variant rounded font-mono text-mono-md text-light-on-surface"
              />
            </label>
          </div>
          <div className="flex justify-end gap-gutter-sm pt-gutter-sm border-t border-light-outline-variant">
            <button
              type="button"
              onClick={() => setVehicleModalOpen(false)}
              className="px-gutter-md py-gutter-sm rounded border border-light-outline-variant font-label text-label-lg text-light-on-surface"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-gutter-md py-gutter-sm rounded bg-light-primary text-light-on-primary font-label text-label-lg"
            >
              Associar Viatura
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
