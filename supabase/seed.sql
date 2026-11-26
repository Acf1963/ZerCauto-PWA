-- ============================================================================
-- ZercAuto Gest PWA — Dados Iniciais Idempotentes (Angola · AOA / Kz)
-- ============================================================================
-- Execute após schema.sql e rls_policies.sql no Supabase SQL Editor.
-- Os UUIDs determinísticos coincidem 1:1 com src/db/seed.ts no frontend.
-- ============================================================================

-- 1. Configuração da Oficina (ZercAuto)
INSERT INTO public.workshop_settings (
  id, company_name, nif, address, phone, email, logo_url,
  fo_prefix, default_currency, vat_rate, hourly_rate_aoa, invoice_footer, auto_sync
)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'ZercAuto Oficina Central',
  '5402198304',
  'Av. Deolinda Rodrigues, Km 4, Luanda',
  '+244 923 500 100',
  'oficina@zercauto.ao',
  '/logo-zerca.png',
  'FO-2026',
  'AOA',
  14.00,
  12000.00,
  'Obrigado pela preferência. Garantia de serviço de 90 dias ou 5.000 km.',
  true
)
ON CONFLICT (id) DO NOTHING;

-- 2. Fornecedores
INSERT INTO public.suppliers (id, name, nif, phone, email, category, payment_terms, delivery_eta)
VALUES
  ('33333333-3333-4333-8333-333333333301', 'AutoPeças Luanda Lda', '5001122334', '+244 923 110 400', 'encomendas@autopecasluanda.ao', 'Motor/Filtros', '30 dias', '24h'),
  ('33333333-3333-4333-8333-333333333302', 'TecnoAuto Angola', '5004455667', '+244 912 440 918', 'comercial@tecnoauto.ao', 'Travagem', '15 dias', '48h'),
  ('33333333-3333-4333-8333-333333333303', 'Importadora MotorSul', '5007788990', '+244 924 778 210', 'vendas@motorsul.ao', 'Transmissão', 'Pronto Pagamento', '72h'),
  ('33333333-3333-4333-8333-333333333304', 'Sonangol Lubrificantes', '5000011229', '+244 222 640 200', 'distrib@sonangol-lub.ao', 'Lubrificantes', '30 dias', '24h')
ON CONFLICT (id) DO NOTHING;

-- 3. Clientes (Particulares e Frotas Empresariais de Luanda)
INSERT INTO public.clients (id, name, nif, phone, email, address, client_type, notes)
VALUES
  ('11111111-1111-4111-8111-111111111101', 'Carlos Manuel', '5417029184', '+244 923 410 812', 'carlos.manuel@email.ao', 'Rua Comandante Gika, Nº 48, Luanda', 'particular', 'Prefere contacto por WhatsApp antes de aprovar orçamento extra.'),
  ('11111111-1111-4111-8111-111111111102', 'Transportes Atlântico Lda', '5001284901', '+244 912 880 340', 'frota@atlantico.ao', 'Zona Industrial do Kikuxi, Lote 14, Viana', 'empresa', 'Frota comercial com faturação mensal a 15 dias.'),
  ('11111111-1111-4111-8111-111111111103', 'Sofia Ferreira', '2419803312', '+244 931 554 209', 'sofia.ferreira@mail.ao', 'Condomínio Jardim de Rosas, Bloco B, Talatona', 'particular', 'Solicita sempre aviso quando as peças chegarem do fornecedor.'),
  ('11111111-1111-4111-8111-111111111104', 'João Baptista', '0041928371', '+244 924 119 770', 'jbaptista@net.ao', 'Rua Kwame Nkrumah, Nº 112, Maianga', 'particular', 'Cliente particular com revisões semestrais regulares.'),
  ('11111111-1111-4111-8111-111111111105', 'Oficina Móvel Sul', '5008941203', '+244 926 300 415', 'operacoes@movelsul.ao', 'Estrada Nacional 100, Benfica, Luanda', 'empresa', 'Parceiro de assistência em estrada.'),
  ('11111111-1111-4111-8111-111111111106', 'Construtora Norte SA', '5003349120', '+244 922 610 900', 'manutencao@construtoranorte.ao', 'Avenida Fidel Castro, Kilamba', 'empresa', 'Prioridade em viaturas de obra pesadas.')
ON CONFLICT (id) DO NOTHING;

-- 4. Viaturas (Matrículas Angolanas LD-00-00-AA)
INSERT INTO public.vehicles (id, client_id, license_plate, brand, model, year, vin, fuel_type, current_mileage)
VALUES
  ('22222222-2222-4222-8222-222222222201', '11111111-1111-4111-8111-111111111101', 'LD-42-88-AB', 'Toyota', 'Hilux 2.4 D-4D', 2021, 'AHTFB8CD001294810', 'Diesel', 124300),
  ('22222222-2222-4222-8222-222222222202', '11111111-1111-4111-8111-111111111101', 'LD-88-14-CD', 'Toyota', 'Corolla 1.8 Hybrid', 2022, 'JTDBR32E004918201', 'Híbrido', 68120),
  ('22222222-2222-4222-8222-222222222203', '11111111-1111-4111-8111-111111111102', 'LD-19-04-GH', 'Mitsubishi', 'Canter Fuso 3.0', 2020, 'JL6BNG1A002819402', 'Diesel', 186400),
  ('22222222-2222-4222-8222-222222222204', '11111111-1111-4111-8111-111111111102', 'LD-21-55-MN', 'Toyota', 'Hiace 2.5 D-4D', 2019, 'JTFSS22P000192834', 'Diesel', 210500),
  ('22222222-2222-4222-8222-222222222205', '11111111-1111-4111-8111-111111111103', 'LD-77-12-CD', 'Renault', 'Clio 1.5 dCi', 2021, 'VF1R9800067123490', 'Diesel', 74900),
  ('22222222-2222-4222-8222-222222222206', '11111111-1111-4111-8111-111111111104', 'LD-33-40-JK', 'Hyundai', 'Tucson 2.0 CRDi', 2022, 'KMHJ3813MNU129801', 'Diesel', 59300),
  ('22222222-2222-4222-8222-222222222207', '11111111-1111-4111-8111-111111111105', 'LD-05-91-EF', 'Isuzu', 'D-Max 3.0 TD', 2020, 'MPATFS85JLT004912', 'Diesel', 141800),
  ('22222222-2222-4222-8222-222222222208', '11111111-1111-4111-8111-111111111106', 'LD-64-19-PQ', 'Ford', 'Ranger Wildtrak 3.2', 2021, '6FPPXXMJ2PMA83921', 'Diesel', 112600)
ON CONFLICT (id) DO NOTHING;

-- 5. Inventário de Peças (8 Artigos em AOA / Kz)
INSERT INTO public.inventory_items (
  id, sku, name, category, supplier_id, stock_qty, min_stock_alert, cost_price_aoa, sell_price_aoa, unit
)
VALUES
  ('44444444-4444-4444-8444-444444444401', 'FLT-P712', 'Filtro de Óleo Bosch P712', 'Filtros', '33333333-3333-4333-8333-333333333301', 2, 8, 4200.00, 7500.00, 'un'),
  ('44444444-4444-4444-8444-444444444402', 'TRV-1550', 'Pastilhas Travão TRW GDB1550', 'Travagem', '33333333-3333-4333-8333-333333333302', 1, 4, 18500.00, 29000.00, 'jg'),
  ('44444444-4444-4444-8444-444444444403', 'MOT-K015', 'Correia Distribuição Gates K015', 'Motor', '33333333-3333-4333-8333-333333333301', 0, 3, 31000.00, 48000.00, 'un'),
  ('44444444-4444-4444-8444-444444444404', 'EMB-4410', 'Kit Embraiagem LuK 624', 'Transmissão', '33333333-3333-4333-8333-333333333303', 4, 2, 115000.00, 165000.00, 'un'),
  ('44444444-4444-4444-8444-444444444405', 'LUB-5W30', 'Óleo 5W-30 Sintético Castrol', 'Lubrificantes', '33333333-3333-4333-8333-333333333304', 28, 15, 4800.00, 7000.00, 'L'),
  ('44444444-4444-4444-8444-444444444406', 'TRV-2090', 'Discos Ventilados Brembo 298mm', 'Travagem', '33333333-3333-4333-8333-333333333302', 6, 2, 46000.00, 68000.00, 'par'),
  ('44444444-4444-4444-8444-444444444407', 'FLT-AR90', 'Filtro de Ar Mann C2501', 'Filtros', '33333333-3333-4333-8333-333333333301', 12, 5, 6500.00, 11200.00, 'un'),
  ('44444444-4444-4444-8444-444444444408', 'BAT-95AH', 'Bateria Varta Silver Dynamic 95Ah', 'Elétrica', '33333333-3333-4333-8333-333333333303', 5, 2, 68000.00, 95000.00, 'un')
ON CONFLICT (id) DO NOTHING;

-- 6. Movimentos de Stock
INSERT INTO public.stock_movements (id, inventory_item_id, sku, item_name, movement_type, quantity, unit, reference)
VALUES
  ('55555555-5555-4555-8555-555555555501', '44444444-4444-4444-8444-444444444404', 'EMB-4410', 'Kit Embraiagem LuK 624', 'saida', 1, 'un', 'FO-2026-0142'),
  ('55555555-5555-4555-8555-555555555502', '44444444-4444-4444-8444-444444444405', 'LUB-5W30', 'Óleo 5W-30 Sintético Castrol', 'saida', 6, 'L', 'FO-2026-0142'),
  ('55555555-5555-4555-8555-555555555503', '44444444-4444-4444-8444-444444444405', 'LUB-5W30', 'Óleo 5W-30 Sintético Castrol', 'entrada', 24, 'L', 'GUI-2026-089'),
  ('55555555-5555-4555-8555-555555555504', '44444444-4444-4444-8444-444444444402', 'TRV-1550', 'Pastilhas Travão TRW GDB1550', 'saida', 2, 'jg', 'FO-2026-0141')
ON CONFLICT (id) DO NOTHING;

-- 7. Folhas de Obra (FO-2026-0140 a FO-2026-0142 + Ordens Liquidadas)
INSERT INTO public.work_orders (
  id, order_number, client_id, vehicle_id, status, complaint_description, diagnosis_notes,
  entry_mileage, parts_total_aoa, labor_total_aoa, discount_aoa, vat_rate, tax_aoa,
  grand_total_aoa, payment_status, payment_method, payment_link, period_key, opened_at
)
VALUES
  (
    '66666666-6666-4666-8666-666666666142',
    'FO-2026-0142',
    '11111111-1111-4111-8111-111111111101',
    '22222222-2222-4222-8222-222222222201',
    'em_execucao',
    'Patina na embraiagem em subidas e revisão dos 120.000 km.',
    'Substituição do kit completo de embraiagem, retentor da cambota e revisão periódica dos 120.000 km.',
    124300,
    207000.00,
    42000.00,
    0.00,
    14.00,
    34860.00,
    283860.00,
    'pendente',
    NULL,
    NULL,
    '2026-11',
    '18/11/2026'
  ),
  (
    '66666666-6666-4666-8666-666666666141',
    'FO-2026-0141',
    '11111111-1111-4111-8111-111111111102',
    '22222222-2222-4222-8222-222222222203',
    'concluido',
    'Vibração acentuada ao travar com carga e bateria fraca.',
    'Revisão completa do sistema de travagem dianteiro, substituição de discos ventilados, pastilhas e bateria auxiliar.',
    186400,
    289000.00,
    72000.00,
    0.00,
    14.00,
    50540.00,
    411540.00,
    'link_online',
    'Pagamento Online (Link / Ref.)',
    'https://pay.zercauto.ao/fo-2026-0141',
    '2026-11',
    '17/11/2026'
  ),
  (
    '66666666-6666-4666-8666-666666666140',
    'FO-2026-0140',
    '11111111-1111-4111-8111-111111111103',
    '22222222-2222-4222-8222-222222222205',
    'orcamento',
    'Ruído metálico na zona da distribuição a frio.',
    'Substituição da correia de distribuição Gates e kit de tensores; aguarda entrega do fornecedor.',
    74900,
    76000.00,
    27600.00,
    0.00,
    14.00,
    14504.00,
    118104.00,
    'pendente',
    NULL,
    NULL,
    '2026-11',
    '16/11/2026'
  ),
  (
    '66666666-6666-4666-8666-666666666138',
    'FO-2026-0138',
    '11111111-1111-4111-8111-111111111104',
    '22222222-2222-4222-8222-222222222206',
    'entregue',
    'Revisão programada dos 60.000 km.',
    'Revisão periódica dos 60.000 km: óleo 5W-30, filtro de óleo, filtro de ar e verificação eletrónica.',
    59300,
    53700.00,
    28800.00,
    0.00,
    14.00,
    11550.00,
    94050.00,
    'liquidado',
    'TPA / Multicaixa',
    NULL,
    '2026-11',
    '12/11/2026'
  ),
  (
    '66666666-6666-4666-8666-666666666135',
    'FO-2026-0135',
    '11111111-1111-4111-8111-111111111106',
    '22222222-2222-4222-8222-222222222208',
    'entregue',
    'Dificuldade ao engrenar mudanças em obra.',
    'Reparação de transmissão, substituição de embraiagem pesada, discos e pastilhas de travão.',
    112600,
    398000.00,
    144000.00,
    0.00,
    14.00,
    75880.00,
    617880.00,
    'liquidado',
    'Transferência Bancária',
    NULL,
    '2026-11',
    '08/11/2026'
  )
ON CONFLICT (id) DO NOTHING;

-- 8. Itens das Folhas de Obra (Peças & Mão de Obra)
INSERT INTO public.work_order_items (
  id, work_order_id, item_type, inventory_item_id, sku, technician_name,
  description, quantity, unit, unit_cost_aoa, unit_price_aoa, total_price_aoa
)
VALUES
  -- FO-2026-0142
  ('77777777-7777-4777-8777-777777777001', '66666666-6666-4666-8666-666666666142', 'peca', '44444444-4444-4444-8444-444444444404', 'EMB-4410', NULL, 'Kit Embraiagem LuK 624', 1, 'un', 115000.00, 165000.00, 165000.00),
  ('77777777-7777-4777-8777-777777777002', '66666666-6666-4666-8666-666666666142', 'peca', '44444444-4444-4444-8444-444444444405', 'LUB-5W30', NULL, 'Óleo 5W-30 Sintético Castrol', 6, 'L', 4800.00, 7000.00, 42000.00),
  ('77777777-7777-4777-8777-777777778001', '66666666-6666-4666-8666-666666666142', 'mao_obra', NULL, NULL, 'Paulo Silva', 'Mão de Obra · Substituição embraiagem e revisão', 3.5, 'h', 0.00, 12000.00, 42000.00),

  -- FO-2026-0141
  ('77777777-7777-4777-8777-777777777003', '66666666-6666-4666-8666-666666666141', 'peca', '44444444-4444-4444-8444-444444444406', 'TRV-2090', NULL, 'Discos Ventilados Brembo 298mm', 2, 'par', 46000.00, 68000.00, 136000.00),
  ('77777777-7777-4777-8777-777777777004', '66666666-6666-4666-8666-666666666141', 'peca', '44444444-4444-4444-8444-444444444402', 'TRV-1550', NULL, 'Pastilhas Travão TRW GDB1550', 2, 'jg', 18500.00, 29000.00, 58000.00),
  ('77777777-7777-4777-8777-777777777005', '66666666-6666-4666-8666-666666666141', 'peca', '44444444-4444-4444-8444-444444444408', 'BAT-95AH', NULL, 'Bateria Varta Silver Dynamic 95Ah', 1, 'un', 68000.00, 95000.00, 95000.00),
  ('77777777-7777-4777-8777-777777778002', '66666666-6666-4666-8666-666666666141', 'mao_obra', NULL, NULL, 'Paulo Silva', 'Mão de Obra · Travagem pesada e diagnóstico elétrico', 6, 'h', 0.00, 12000.00, 72000.00),

  -- FO-2026-0140
  ('77777777-7777-4777-8777-777777777006', '66666666-6666-4666-8666-666666666140', 'peca', '44444444-4444-4444-8444-444444444403', 'MOT-K015', NULL, 'Correia Distribuição Gates K015', 1, 'un', 31000.00, 48000.00, 48000.00),
  ('77777777-7777-4777-8777-777777777007', '66666666-6666-4666-8666-666666666140', 'peca', '44444444-4444-4444-8444-444444444405', 'LUB-5W30', NULL, 'Óleo 5W-30 Sintético Castrol', 4, 'L', 4800.00, 7000.00, 28000.00),
  ('77777777-7777-4777-8777-777777778003', '66666666-6666-4666-8666-666666666140', 'mao_obra', NULL, NULL, 'Mateus Domingos', 'Mão de Obra · Desmontagem frente e distribuição', 2.3, 'h', 0.00, 12000.00, 27600.00),

  -- FO-2026-0138
  ('77777777-7777-4777-8777-777777777011', '66666666-6666-4666-8666-666666666138', 'peca', '44444444-4444-4444-8444-444444444405', 'LUB-5W30', NULL, 'Óleo 5W-30 Sintético Castrol', 5, 'L', 4800.00, 7000.00, 35000.00),
  ('77777777-7777-4777-8777-777777777012', '66666666-6666-4666-8666-666666666138', 'peca', '44444444-4444-4444-8444-444444444401', 'FLT-P712', NULL, 'Filtro de Óleo Bosch P712', 1, 'un', 4200.00, 7500.00, 7500.00),
  ('77777777-7777-4777-8777-777777777013', '66666666-6666-4666-8666-666666666138', 'peca', '44444444-4444-4444-8444-444444444407', 'FLT-AR90', NULL, 'Filtro de Ar Mann C2501', 1, 'un', 6500.00, 11200.00, 11200.00),
  ('77777777-7777-4777-8777-777777778005', '66666666-6666-4666-8666-666666666138', 'mao_obra', NULL, NULL, 'Ricardo Mendes', 'Mão de Obra · Revisão 60.000 km e scanner OBD', 2.4, 'h', 0.00, 12000.00, 28800.00),

  -- FO-2026-0135
  ('77777777-7777-4777-8777-777777777014', '66666666-6666-4666-8666-666666666135', 'peca', '44444444-4444-4444-8444-444444444404', 'EMB-4410', NULL, 'Kit Embraiagem LuK 624', 2, 'un', 115000.00, 165000.00, 330000.00),
  ('77777777-7777-4777-8777-777777777015', '66666666-6666-4666-8666-666666666135', 'peca', '44444444-4444-4444-8444-444444444406', 'TRV-2090', NULL, 'Discos Ventilados Brembo 298mm', 1, 'par', 46000.00, 68000.00, 68000.00),
  ('77777777-7777-4777-8777-777777778006', '66666666-6666-4666-8666-666666666135', 'mao_obra', NULL, NULL, 'Paulo Silva', 'Mão de Obra · Transmissão e travagem 4x4', 12, 'h', 0.00, 12000.00, 144000.00)
ON CONFLICT (id) DO NOTHING;

-- 9. Pagamentos e Registos de Cobrança (Pendente / Link Online / Liquidado)
INSERT INTO public.payments (
  id, work_order_id, amount_aoa, method, status, reference_code, payment_date, period_key
)
VALUES
  ('88888888-8888-4888-8888-888888888801', '66666666-6666-4666-8666-666666666138', 94050.00, 'multicaixa', 'liquidado', 'TPA-994120', '2026-11-15T17:10:00.000Z', '2026-11'),
  ('88888888-8888-4888-8888-888888888802', '66666666-6666-4666-8666-666666666135', 617880.00, 'transferencia', 'liquidado', 'TRF-2026-881', '2026-11-12T09:00:00.000Z', '2026-11'),
  ('88888888-8888-4888-8888-888888888803', '66666666-6666-4666-8666-666666666141', 411540.00, 'link_online', 'link_online', 'PAY-0141-LNK', '2026-11-17T16:45:00.000Z', '2026-11')
ON CONFLICT (id) DO NOTHING;
