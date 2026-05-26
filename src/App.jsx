import React, { useEffect, useMemo, useState } from 'react';
import { initializeApp } from 'firebase/app';
import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  BarChart3,
  CheckCircle2,
  Database,
  DatabaseZap,
  Filter,
  Layers3,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';

const firebaseConfig = {
  apiKey: 'AIzaSyBYziumFk_ONDE7tVtdLFyV3L1yMGnzXj0',
  authDomain: 'idox-lifecycle.firebaseapp.com',
  projectId: 'idox-lifecycle',
  storageBucket: 'idox-lifecycle.firebasestorage.app',
  messagingSenderId: '478383450565',
  appId: '1:478383450565:web:f0322a22dd601404d343ac',
  measurementId: 'G-CZL52LFLEF',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const appId = 'idox-lifecycle-hub';

const GOOGLE_SHEET_ID = '17MCi7epIJdxac0xzV2QTGGBUoL4Hi11zhzrbeRtRJXg';
const EDIT_PASSWORD = 'test';

const STANDARD_DEVELOPMENT_STAGES = [
  'Scoping',
  'Feasibility',
  'Preliminary Environmental Screening',
  'Environmental Impact Assessment (EIA)',
  'Concept Design & Planning Application',
  'Government & Community Approvals',
  'Detailed Design & Engineering',
  'Financing & Acquisition',
  'Construction',
  'Sales, Marketing & Handover',
  'Post-Construction Monitoring',
];

const INDUSTRY_STAGES = {
  Housing: STANDARD_DEVELOPMENT_STAGES,
  Solar: STANDARD_DEVELOPMENT_STAGES,
  'Onshore Wind': STANDARD_DEVELOPMENT_STAGES,
  'Offshore Wind': STANDARD_DEVELOPMENT_STAGES,
  Fibre: [
    'Strategic Planning (HLP)',
    'High-Level Design (HLD)',
    'Physical Infrastructure Analysis (PIA)',
    'Field Survey',
    'Low Level Design (LLD)',
    'Civils & Build',
    'As-Built',
  ],
};

const GAP_SHEETS = {
  Housing: 'Gap_Housing',
  Solar: 'Gap_Solar',
  'Onshore Wind': 'Gap_Onshore_Wind',
  'Offshore Wind': 'Gap_Offshore_Wind',
  Fibre: 'Gap_Fibre',
};

const BUSINESS_UNITS = ['Emapsite', 'LandHawk', 'ThinkWhere', 'Backlog'];
const ROLE_ORDER = ['A', 'B', 'D'];

function normalizeValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStageName(value) {
  return normalizeValue(value).replace(/\s+/g, ' ');
}

function normalizeIndustryName(value) {
  const raw = normalizeValue(value).toLowerCase();
  if (raw === 'onshore wind') return 'Onshore Wind';
  if (raw === 'offshore wind') return 'Offshore Wind';
  if (raw === 'housing') return 'Housing';
  if (raw === 'solar') return 'Solar';
  if (raw === 'fibre') return 'Fibre';
  return normalizeValue(value);
}

function normalizeStatus(rawValue) {
  const raw = normalizeValue(rawValue).toLowerCase();
  if (raw.includes('product')) return 'product';
  if (raw.includes('sme')) return 'sme-input';
  if (raw.includes('client')) return 'client-request';
  if (raw.includes('gap') || raw.includes('desired') || raw.includes('candidate')) return 'desired-gap';
  return 'catalogue';
}

function normalizeAccess(rawValue) {
  const raw = normalizeValue(rawValue).toLowerCase();
  if (!raw) return 'unknown';
  if (raw.includes('mixed')) return 'mixed';
  if (raw.includes('open')) return 'open';
  if (raw.includes('proprietary') || raw.includes('licensed') || raw.includes('paid')) return 'proprietary';
  return 'unknown';
}

function normalizeBusinessUnit(rawValue, supplier = '', status = '') {
  const raw = `${normalizeValue(rawValue)} ${normalizeValue(supplier)} ${normalizeValue(status)}`.toLowerCase();
  if (raw.includes('thinkwhere')) return 'ThinkWhere';
  if (raw.includes('landhawk')) return 'LandHawk';
  if (raw.includes('emapsite') || raw.includes('emap') || raw.includes('idox')) return 'Emapsite';
  return 'Backlog';
}

function normalizeFactorGroup(rawValue) {
  const raw = normalizeValue(rawValue).toLowerCase();
  if (!raw) return 'Unclassified';
  if (raw.includes('reference')) return 'Reference';
  if (raw.includes('analytical')) return 'Analytical';
  return normalizeValue(rawValue);
}

function normalizeUsageValue(rawValue) {
  const raw = normalizeValue(rawValue).toLowerCase();
  if (raw === 'a' || raw.includes('analytical')) return 'A';
  if (raw === 'b' || raw.includes('basemap') || raw.includes('basemapping')) return 'B';
  if (raw === 'd' || raw.includes('descriptive') || raw.includes('context')) return 'D';
  if (raw === 'u' || raw === '?' || raw.includes('unknown')) return 'U';
  return '';
}

function mergeRoleValue(currentRole, nextRole) {
  const rolePriority = { A: 4, B: 3, D: 2, U: 1 };
  if (!currentRole) return nextRole;
  if (!nextRole) return currentRole;
  return (rolePriority[nextRole] || 0) > (rolePriority[currentRole] || 0) ? nextRole : currentRole;
}

function parseCsv(text) {
  const rows = [];
  let current = '';
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(current);
      if (row.some((cell) => cell.trim() !== '')) {
        rows.push(row);
      }
      row = [];
      current = '';
      continue;
    }

    current += char;
  }

  if (current || row.length) {
    row.push(current);
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map((header) => header.trim());

  return rows.slice(1).map((values) =>
    headers.reduce((record, header, index) => {
      record[header] = values[index]?.trim() ?? '';
      return record;
    }, {}),
  );
}

function parseGoogleSheetJson(text) {
  const prefix = 'google.visualization.Query.setResponse(';
  const suffix = ');';
  const start = text.indexOf(prefix);
  const end = text.lastIndexOf(suffix);

  if (start === -1 || end === -1) {
    throw new Error('Unexpected Google Sheets response format.');
  }

  return JSON.parse(text.slice(start + prefix.length, end));
}

function sheetTableToObjects(table) {
  const headers = (table.cols || []).map((column) => column.label || column.id || '');
  return (table.rows || []).map((row) =>
    headers.reduce((record, header, index) => {
      const cell = row.c?.[index];
      record[header] = cell?.v ?? '';
      return record;
    }, {}),
  );
}

function gapTableToObjects(table) {
  const rows = (table.rows || []).map((row) => (row.c || []).map((cell) => normalizeValue(cell?.v)));
  if (rows.length === 0) return [];
  const headers = rows[0].map((header) => normalizeStageName(header));
  return rows.slice(1).map((values) =>
    headers.reduce((record, header, index) => {
      record[header] = values[index] ?? '';
      return record;
    }, {}),
  );
}

function normaliseDataset(input, index = 0) {
  const source = normalizeValue(input.source || input.Source);
  const status = normalizeStatus(
    input.status || input.Status || input['Source Status'] || input['Source/Status'] || input.catalogueStatus,
  );
  const supplier = normalizeValue(input.supplier || input.Supplier || input.Provider);
  const businessUnit = normalizeBusinessUnit(
    input.businessUnit ||
      input.BusinessUnit ||
      input.BU ||
      input.bu ||
      input.Company ||
      input.origin_company ||
      input.originCompany ||
      input['Origin Company'],
    supplier,
    status,
  );
  const openProprietary = normalizeAccess(
    input.openProprietary || input['Open / proprietary'] || input['Open/Proprietary'] || input.Access || input.Licensing,
  );

  const usage = {};
  const knownStages = new Set(Object.values(INDUSTRY_STAGES).flat().map(normalizeStageName));
  const industryUsage = {};
  if (input.industryUsage && typeof input.industryUsage === 'object') {
    Object.entries(input.industryUsage).forEach(([industryName, stageMap]) => {
      const normalizedIndustry = normalizeIndustryName(industryName);
      if (!normalizedIndustry || !stageMap || typeof stageMap !== 'object') return;
      industryUsage[normalizedIndustry] = {};
      Object.entries(stageMap).forEach(([stageName, roleValue]) => {
        const normalizedStageName = normalizeStageName(stageName);
        if (!knownStages.has(normalizedStageName)) return;
        const marker = normalizeUsageValue(roleValue);
        if (marker) {
          industryUsage[normalizedIndustry][normalizedStageName] = marker;
          usage[normalizedStageName] = mergeRoleValue(usage[normalizedStageName], marker);
        }
      });
    });
  }
  if (input.usage && typeof input.usage === 'object') {
    Object.entries(input.usage).forEach(([stageName, roleValue]) => {
      const normalizedStageName = normalizeStageName(stageName);
      if (!knownStages.has(normalizedStageName)) return;
      const marker = normalizeUsageValue(roleValue);
      if (marker) usage[normalizedStageName] = mergeRoleValue(usage[normalizedStageName], marker);
    });
  }
  Object.entries(input || {}).forEach(([key, value]) => {
    const normalizedStageName = normalizeStageName(key);
    if (!knownStages.has(normalizedStageName)) return;
    const marker = normalizeUsageValue(value);
    if (marker) usage[normalizedStageName] = mergeRoleValue(usage[normalizedStageName], marker);
  });

  return {
    id: input.id || `dataset-${index}`,
    sourceDataId: normalizeValue(input.sourceDataId || input.data_id),
    rawName: normalizeValue(input.name || input.Name || input.Dataset || input.Dataset_Name),
    commonName: normalizeValue(input.commonName || input['Common Name'] || input.common_name) || 'Untitled dataset',
    group: normalizeValue(input.group || input.Group || input['Data Group']) || 'General',
    factor: normalizeValue(input.factor || input.Factor) || '',
    factorGroup: normalizeFactorGroup(input.factorGroup || input['Factor Group']),
    productFamily:
      normalizeValue(input.productFamily || input.product_family || input['product_family'] || input['Product Family']) || '',
    businessUnit,
    supplier: supplier || 'Not set',
    description:
      normalizeValue(input.description || input.Description || input['Usage Summary']) ||
      'Governed geospatial record managed for lifecycle use across products and project stages.',
    coverage: normalizeValue(input.coverage || input.Coverage) || 'Not stated',
    source,
    isClientOnly:
      Boolean(input.isClientOnly) ||
      source.toLowerCase().includes('client data') ||
      normalizeValue(input.clientSpecific || input.client_only || input.clientOnly).toLowerCase() === 'yes',
    status,
    openProprietary,
    usage,
    industryUsage,
    stageCount:
      Object.keys(industryUsage).length > 0
        ? new Set(Object.values(industryUsage).flatMap((stageMap) => Object.keys(stageMap))).size
        : Object.keys(usage).length,
    updatedAt: input.updatedAt || null,
  };
}

function roleLabel(role) {
  const labels = {
    A: 'Analytical',
    B: 'Basemapping',
    D: 'Descriptive / contextual',
    U: 'Unknown / needs classification',
  };
  return labels[role] || role;
}

function statusLabel(status) {
  const labels = {
    catalogue: 'Catalogue',
    product: 'Product',
    'desired-gap': 'Desired / gap',
    'sme-input': 'SME input',
    'client-request': 'Client request',
  };
  return labels[status] || status;
}

function rolePriorityValue(role) {
  const order = { A: 4, B: 3, D: 2, U: 1 };
  return order[role] || 0;
}

function roleShortLabel(role) {
  if (role === 'A') return 'Analytical';
  if (role === 'B') return 'Basemapping';
  if (role === 'D') return 'Context';
  return 'Unknown';
}

function inferJurisdictions(dataset) {
  const haystack = [
    dataset.commonName,
    dataset.rawName,
    dataset.group,
    dataset.factor,
    dataset.supplier,
    dataset.coverage,
    dataset.description,
  ]
    .join(' ')
    .toLowerCase();

  const matches = [];
  if (haystack.includes('england') || haystack.includes('natural england') || haystack.includes('environment agency')) matches.push('England');
  if (haystack.includes('scotland') || haystack.includes('naturescot') || haystack.includes('sepa') || haystack.includes('hes')) matches.push('Scotland');
  if (haystack.includes('wales') || haystack.includes('nrw') || haystack.includes('cadw')) matches.push('Wales');
  if (haystack.includes('great britain') || haystack.includes('gb') || haystack.includes('national grid') || haystack.includes('ordnance survey')) matches.push('GB');
  if (matches.length === 0) matches.push('GB');
  return Array.from(new Set(matches));
}

function getDatasetsForIndustry(datasets, industry, filters = {}) {
  const stages = INDUSTRY_STAGES[industry] || [];
  return datasets.filter((dataset) => {
    const touchesIndustry = stages.some((stage) => getUsageForIndustryStage(dataset, industry, stage));
    if (!touchesIndustry) return false;

    const haystack = [
      dataset.commonName,
      dataset.rawName,
      dataset.group,
      dataset.factor,
      dataset.factorGroup,
      dataset.productFamily,
      dataset.supplier,
      dataset.description,
      dataset.coverage,
    ]
      .join(' ')
      .toLowerCase();

    const matchesSearch = !filters.search || haystack.includes(filters.search.toLowerCase());
    const matchesFamily = !filters.dataGroup || filters.dataGroup === 'all' || dataset.group === filters.dataGroup;
    const matchesAvailability =
      !filters.availability ||
      filters.availability === 'all' ||
      (filters.availability === 'catalogue' && dataset.status === 'catalogue') ||
      (filters.availability === 'product' && dataset.status === 'product') ||
      (filters.availability === 'required' && ['desired-gap', 'sme-input', 'client-request'].includes(dataset.status)) ||
      (filters.availability === 'missing-catalogue' && dataset.status !== 'catalogue') ||
      (filters.availability === 'not-productised' && dataset.status !== 'product');

    return matchesSearch && matchesFamily && matchesAvailability;
  });
}

function getUsageForIndustryStage(dataset, industry, stage) {
  const normalizedIndustry = normalizeIndustryName(industry);
  const normalizedStage = normalizeStageName(stage);
  return dataset.industryUsage?.[normalizedIndustry]?.[normalizedStage] || dataset.usage?.[normalizedStage] || '';
}

function getIndustryStagesUsed(dataset, industry) {
  return (INDUSTRY_STAGES[industry] || []).filter((stageName) => Boolean(getUsageForIndustryStage(dataset, industry, stageName)));
}

function accessPriorityValue(access) {
  const order = { open: 1, mixed: 2, proprietary: 3, unknown: 4 };
  return order[access] || 5;
}

function normalizePairingName(value) {
  return normalizeValue(value)
    .toLowerCase()
    .replace(/\b(open|open source|premium|proprietary|licensed|paid|gb|england|scotland|wales)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function rowBandClass(access) {
  if (access === 'open') return 'bg-fuchsia-100/60';
  if (access === 'proprietary') return 'bg-sky-100/80';
  if (access === 'mixed') return 'bg-violet-100/70';
  return 'bg-white';
}

function getStageEntries(datasets, industry, stage) {
  return datasets
    .filter((dataset) => getUsageForIndustryStage(dataset, industry, stage))
    .map((dataset) => ({
      dataset,
      role: getUsageForIndustryStage(dataset, industry, stage),
    }));
}

function LogoMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="h-5 w-5 rotate-45 rounded-[4px] border-[3px] border-brand-blue" />
      </div>
      <div className="leading-none">
        <div className="text-[11px] font-black uppercase tracking-[0.32em] text-brand-blue">Idox Geospatial</div>
        <div className="mt-2 text-2xl font-black tracking-tight text-brand-navy">Data Lifecycles MVP</div>
      </div>
    </div>
  );
}

function ShellCard({ children, className = '' }) {
  return <div className={`rounded-[28px] border border-slate-200 bg-white shadow-panel ${className}`}>{children}</div>;
}

function FilterField({ label, children, className = '', compact = false }) {
  return (
    <div className={className}>
      <label className={`mb-2 block font-black uppercase tracking-[0.18em] text-slate-400 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>{label}</label>
      {children}
    </div>
  );
}

function StatusBadge({ status }) {
  const styleMap = {
    catalogue: 'border-brand-grey bg-slate-50 text-brand-heading',
    product: 'border-green-200 bg-green-50 text-brand-green',
    'desired-gap': 'border-orange-200 bg-orange-50 text-brand-orange',
    'sme-input': 'border-sky-200 bg-sky-50 text-brand-blue',
    'client-request': 'border-rose-200 bg-rose-50 text-rose-700',
  };

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${styleMap[status] || styleMap.catalogue}`}>
      {statusLabel(status)}
    </span>
  );
}

function AccessBadge({ access }) {
  const styleMap = {
    open: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700',
    proprietary: 'border-sky-200 bg-sky-50 text-brand-blue',
    mixed: 'border-violet-200 bg-violet-50 text-violet-700',
    unknown: 'border-slate-200 bg-slate-50 text-slate-600',
  };

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${styleMap[access] || styleMap.unknown}`}>
      {access === 'unknown' ? 'Unknown' : access}
    </span>
  );
}

function RoleBadge({ role }) {
  const styleMap = {
    A: 'border-green-300 bg-green-100 text-brand-green',
    B: 'border-sky-200 bg-sky-50 text-brand-blue',
    D: 'border-green-200 bg-green-50 text-green-700',
    U: 'border-slate-300 bg-slate-200 text-slate-600',
  };

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${styleMap[role] || styleMap.U}`}>
      {roleLabel(role)}
    </span>
  );
}

function UsageMarker({ value }) {
  const styleMap = {
    A: 'bg-brand-green text-white',
    B: 'bg-brand-sky text-white',
    D: 'bg-green-300 text-green-900',
    U: 'bg-slate-300 text-slate-700',
  };

  return value ? (
    <div className={`flex h-8 w-8 items-center justify-center rounded-xl text-[11px] font-black ${styleMap[value]}`}>{value}</div>
  ) : (
    <div className="h-8 w-8 rounded-xl border border-slate-200 bg-slate-100" />
  );
}

function PasswordPrompt({ onClose, onSubmit, error }) {
  const [password, setPassword] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-7 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.24em] text-brand-blue">Edit access</div>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-brand-navy">Unlock catalogue editing</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 hover:text-slate-700">
            <X size={16} />
          </button>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          This MVP keeps edit mode behind a simple password so the governed catalogue view stays read-only by default.
        </p>
        <div className="mt-6">
          <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Password</label>
          <input
            autoFocus
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="field-control"
            placeholder="Enter edit password"
          />
          {error ? <div className="mt-3 text-sm font-semibold text-rose-600">{error}</div> : null}
        </div>
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={() => onSubmit(password)} className="rounded-full bg-brand-blue px-5 py-2.5 text-sm font-black uppercase tracking-[0.16em] text-white">
            Unlock editing
          </button>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-black uppercase tracking-[0.16em] text-slate-600">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, note, icon: Icon }) {
  return (
    <ShellCard className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">{label}</div>
          <div className="mt-3 text-3xl font-black tracking-tight text-brand-navy">{value}</div>
          {note ? <div className="mt-2 text-sm font-medium text-slate-500">{note}</div> : null}
        </div>
        <div className="rounded-2xl bg-slate-50 p-3 text-brand-blue">
          <Icon size={20} />
        </div>
      </div>
    </ShellCard>
  );
}

function OverviewPage({ datasets, onOpenRole }) {
  const totalStages = Object.values(INDUSTRY_STAGES).reduce((count, stages) => count + stages.length, 0);
  const gapCount = datasets.filter((dataset) => dataset.status === 'desired-gap').length;
  const backlogCount = datasets.filter((dataset) => dataset.businessUnit === 'Backlog').length;
  const unknownCount = datasets.filter((dataset) => Object.values(dataset.usage || {}).includes('U')).length;

  const cards = [
    {
      title: 'Sales',
      body: 'Start in the lifecycle touchpoint matrix and switch to the role-led stage view when you need a clearer client answer.',
      action: () => onOpenRole('sales'),
      icon: Users,
    },
    {
      title: 'Data',
      body: 'Browse the governed catalogue, inspect open versus proprietary coverage, and unlock controlled edits when needed.',
      action: () => onOpenRole('data'),
      icon: Database,
    },
    {
      title: 'Leadership',
      body: 'Review candidate gaps, backlog pressure, and the highest-value areas for data curation and product investment.',
      action: () => onOpenRole('leadership'),
      icon: BarChart3,
    },
  ];

  return (
    <div className="space-y-8">
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <ShellCard className="p-8">
          <div className="text-[11px] font-black uppercase tracking-[0.24em] text-brand-blue">Overview</div>
          <h1 className="mt-3 max-w-4xl text-5xl font-black tracking-tight text-brand-navy">
            Governed lifecycle insight for sales, data, and leadership teams.
          </h1>
          <p className="mt-5 max-w-4xl text-base leading-8 text-slate-500">
            This Firebase-backed MVP turns the workbook into a working internal product. Teams can see which geospatial
            datasets matter at each project stage, where the governed catalogue is strong, and where the next data gaps
            need attention.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <button type="button" onClick={() => onOpenRole('sales')} className="rounded-full bg-brand-blue px-6 py-3 text-sm font-black uppercase tracking-[0.16em] text-white">
              Open sales view
            </button>
            <button type="button" onClick={() => onOpenRole('data')} className="rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-black uppercase tracking-[0.16em] text-slate-700">
              Open data view
            </button>
            <button type="button" onClick={() => onOpenRole('leadership')} className="rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-black uppercase tracking-[0.16em] text-slate-700">
              Open leadership view
            </button>
          </div>
        </ShellCard>

        <div className="grid gap-5">
          <StatCard label="Synced records" value={datasets.length} note="Live from Firestore" icon={DatabaseZap} />
          <StatCard label="Lifecycle stages modelled" value={totalStages} note="Across current industry templates" icon={Layers3} />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-4">
        <StatCard label="Desired / gap items" value={gapCount} note="Not yet fully governed" icon={Sparkles} />
        <StatCard label="Backlog-owned items" value={backlogCount} note="Not yet tied to a platform company" icon={Filter} />
        <StatCard label="Needs classification" value={unknownCount} note="Contains unknown lifecycle roles" icon={AlertTriangle} />
        <StatCard label="Governed catalogue" value={datasets.filter((d) => d.status === 'catalogue').length} note="Clean user-facing catalogue items" icon={ShieldCheck} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {cards.map((card) => (
          <button key={card.title} type="button" onClick={card.action} className="text-left">
            <ShellCard className="h-full p-6 transition hover:-translate-y-0.5 hover:border-brand-sky">
              <div className="flex items-start justify-between gap-4">
                <div className="rounded-2xl bg-slate-50 p-3 text-brand-blue">
                  <card.icon size={20} />
                </div>
                <ArrowRight size={18} className="text-slate-300" />
              </div>
              <div className="mt-6 text-[11px] font-black uppercase tracking-[0.24em] text-brand-blue">{card.title}</div>
              <h3 className="mt-3 text-2xl font-black tracking-tight text-brand-navy">{card.title === 'Data' ? 'Governed catalogue workspace' : card.title === 'Sales' ? 'Stage-first answers' : 'Portfolio gap insight'}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-500">{card.body}</p>
            </ShellCard>
          </button>
        ))}
      </div>
    </div>
  );
}

function SalesWorkspace({ datasets }) {
  const visibleDatasets = useMemo(() => datasets.filter((dataset) => !dataset.isClientOnly), [datasets]);
  const industries = Object.keys(INDUSTRY_STAGES);
  const MATRIX_ROLE_OPTIONS = [
    { value: 'all', label: 'All' },
    { value: 'used', label: 'Any used' },
    { value: 'A', label: 'A' },
    { value: 'B', label: 'B' },
    { value: 'D', label: 'D' },
    { value: 'U', label: 'U' },
    { value: 'none', label: 'Empty' },
  ];
  const [industry, setIndustry] = useState(industries[0]);
  const [viewMode, setViewMode] = useState('touchpoint');
  const [search, setSearch] = useState('');
  const [availability, setAvailability] = useState('all');
  const [dataGroup, setDataGroup] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [salesSort, setSalesSort] = useState('role-priority');
  const [selectedStage, setSelectedStage] = useState(INDUSTRY_STAGES[industries[0]][0]);
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [matrixRoleFilters, setMatrixRoleFilters] = useState({});

  const stages = INDUSTRY_STAGES[industry];
  const families = useMemo(
    () =>
          Array.from(
            new Set(
          getDatasetsForIndustry(visibleDatasets, industry, { search, availability }).map((dataset) => dataset.group),
        ),
      ).sort(),
    [availability, industry, search, visibleDatasets],
  );

  const filteredDatasets = useMemo(
    () => getDatasetsForIndustry(visibleDatasets, industry, { search, availability, dataGroup }),
    [availability, dataGroup, industry, search, visibleDatasets],
  );
  const stageScopedDatasets = useMemo(
    () => filteredDatasets.filter((dataset) => Boolean(getUsageForIndustryStage(dataset, industry, selectedStage))),
    [filteredDatasets, industry, selectedStage],
  );
  const roleLedDatasets = useMemo(
    () =>
      roleFilter === 'all'
        ? stageScopedDatasets
        : stageScopedDatasets.filter((dataset) => getUsageForIndustryStage(dataset, industry, selectedStage) === roleFilter),
    [industry, roleFilter, selectedStage, stageScopedDatasets],
  );
  const sortedRoleLedDatasets = useMemo(() => {
    const roleScore = { A: 4, B: 3, D: 2, U: 1 };

    return [...roleLedDatasets].sort((left, right) => {
      if (salesSort === 'alpha-desc') {
        return right.commonName.localeCompare(left.commonName);
      }
      if (salesSort === 'alpha-asc') {
        return left.commonName.localeCompare(right.commonName);
      }
      const leftScore = roleScore[getUsageForIndustryStage(left, industry, selectedStage)] || 0;
      const rightScore = roleScore[getUsageForIndustryStage(right, industry, selectedStage)] || 0;
      return rightScore - leftScore || left.commonName.localeCompare(right.commonName);
    });
  }, [industry, roleLedDatasets, salesSort, selectedStage]);
  const sortedTouchpointDatasets = useMemo(() => {
    return [...filteredDatasets].sort((left, right) => {
      if (salesSort === 'alpha-desc') {
        return right.commonName.localeCompare(left.commonName);
      }
      if (salesSort === 'alpha-asc') {
        return left.commonName.localeCompare(right.commonName);
      }
      return right.stageCount - left.stageCount || left.commonName.localeCompare(right.commonName);
    });
  }, [filteredDatasets, salesSort]);
  const stageEntries = useMemo(() => {
    return getStageEntries(sortedRoleLedDatasets, industry, selectedStage);
  }, [industry, selectedStage, sortedRoleLedDatasets]);
  const matrixDatasets = useMemo(
    () =>
      sortedTouchpointDatasets.filter((dataset) =>
        stages.every((stageName) => {
          const filterValue = matrixRoleFilters[stageName] || 'all';
          if (filterValue === 'all') return true;
          const usageValue = getUsageForIndustryStage(dataset, industry, stageName);
          if (filterValue === 'used') return Boolean(usageValue);
          if (filterValue === 'none') return !usageValue;
          return usageValue === filterValue;
        }),
      ),
    [industry, matrixRoleFilters, sortedTouchpointDatasets, stages],
  );
  const primaryEntries = stageEntries.filter((entry) => entry.role !== 'U');
  const weakEntries = stageEntries.filter((entry) => entry.role === 'U');
  const selectedRecord = useMemo(
    () => stageEntries.find((entry) => entry.dataset.id === selectedDatasetId) || stageEntries[0] || null,
    [selectedDatasetId, stageEntries],
  );

  useEffect(() => {
    setSelectedStage(stages[0]);
  }, [industry, stages]);

  useEffect(() => {
    setMatrixRoleFilters({});
  }, [industry]);

  useEffect(() => {
    if (selectedRecord && selectedRecord.dataset.id !== selectedDatasetId) {
      setSelectedDatasetId(selectedRecord.dataset.id);
    }
  }, [selectedDatasetId, selectedRecord]);

  const grouped = ROLE_ORDER.map((role) => ({
    role,
    items: primaryEntries.filter((entry) => entry.role === role),
  }));

  function updateMatrixRoleFilter(stageName, nextValue) {
    setMatrixRoleFilters((current) => ({
      ...current,
      [stageName]: nextValue,
    }));
  }

  function resetMatrixFilters() {
    setSearch('');
    setAvailability('all');
    setDataGroup('all');
    setRoleFilter('all');
    setSalesSort('role-priority');
    setMatrixRoleFilters({});
  }

  return (
    <div className="space-y-6">
      <ShellCard className="p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="text-[11px] font-black uppercase tracking-[0.24em] text-brand-blue">Sales</div>
            <h2 className="mt-3 text-4xl font-black tracking-tight text-brand-navy">Lifecycle stage finder</h2>
            <p className="mt-3 text-sm leading-7 text-slate-500">
              Start with the lifecycle touchpoint view for quick conversations, then switch to the role-led stage view
              when you need a cleaner explanation of how the data is used.
            </p>
          </div>
          <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
            {['touchpoint', 'role-led'].map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`rounded-full px-4 py-2 text-sm font-black tracking-tight ${
                  viewMode === mode ? 'bg-brand-blue text-white' : 'text-slate-600'
                }`}
              >
                {mode === 'touchpoint' ? 'Lifecycle touchpoint view' : 'Role-led stage view'}
              </button>
            ))}
          </div>
        </div>
      </ShellCard>

      <div className="sticky top-24 z-20 rounded-[28px] border border-slate-200 bg-white/95 p-4 shadow-panel backdrop-blur">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-brand-heading">{industry} lifecycle stages</div>
            <div className="text-xs text-slate-500">
              The selected stage stays visible while you scan the view.
              {viewMode === 'role-led' && roleFilter !== 'all' ? ` Filtered to ${roleLabel(roleFilter).toLowerCase()} records at this stage.` : ''}
            </div>
          </div>
          <div className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            {(viewMode === 'touchpoint' ? matrixDatasets : sortedRoleLedDatasets).length} datasets in current view
          </div>
        </div>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Industry</div>
          <div className="flex flex-wrap gap-3">
            {industries.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setIndustry(option)}
                className={`rounded-full border px-4 py-2.5 text-sm font-black tracking-tight transition ${
                  industry === option
                    ? 'border-brand-blue bg-brand-blue text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-brand-sky hover:text-brand-heading'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="block text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Current stage</div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              Selected: {selectedStage}
            </div>
          </div>
          <div className="overflow-x-auto pb-1">
            <div
              className="grid min-w-[1120px] gap-[3px] xl:min-w-0"
              style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}
            >
              {stages.map((stage, index) => (
                <button
                  key={stage}
                  type="button"
                  onClick={() => setSelectedStage(stage)}
                  className={`min-h-[92px] min-w-0 px-4 py-3 text-left transition md:px-5 md:py-4 ${
                    stage === selectedStage
                      ? 'bg-gradient-to-br from-brand-blue to-brand-heading text-white shadow-[0_12px_32px_rgba(21,96,130,0.22)]'
                      : 'bg-white text-brand-heading hover:bg-sky-50'
                  }`}
                  style={{
                    clipPath:
                      index === stages.length - 1
                        ? 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 14px 50%)'
                        : 'polygon(0 0, calc(100% - 18px) 0, 100% 50%, calc(100% - 18px) 100%, 0 100%, 14px 50%)',
                  }}
                >
                  <div
                    className={`text-[9px] font-black uppercase tracking-[0.22em] ${
                      stage === selectedStage ? 'text-white/70' : 'text-slate-400'
                    }`}
                  >
                    Stage {index + 1}
                  </div>
                  <div className={`mt-2 text-[13px] font-black leading-[1.25] md:text-sm ${stage === selectedStage ? 'text-white' : 'text-brand-heading'}`}>
                    {stage}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {viewMode === 'touchpoint' ? (
        <ShellCard className="overflow-hidden">
          <div className="border-b border-slate-200 px-6 py-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.24em] text-brand-blue">Lifecycle touchpoint view</div>
                <h3 className="mt-2 text-2xl font-black tracking-tight text-brand-navy">Comparative matrix</h3>
                <p className="mt-2 text-sm leading-7 text-slate-500">
                  The frozen stage rail above is the main stage reference. This matrix keeps the view cleaner by showing the dataset list once and the role markers directly under that shared rail.
                </p>
              </div>
              <div className="flex flex-col items-start gap-3 lg:items-end">
                <button
                  type="button"
                  onClick={resetMatrixFilters}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-slate-600 transition hover:border-brand-sky hover:text-brand-heading"
                >
                  Reset filters
                </button>
                <div className="flex flex-wrap gap-2">
                  {['A', 'B', 'D', 'U'].map((role) => (
                    <RoleBadge key={role} role={role} />
                  ))}
                </div>
              </div>
            </div>
            <SalesControlBar
              search={search}
              setSearch={setSearch}
              availability={availability}
              setAvailability={setAvailability}
              dataGroup={dataGroup}
              setDataGroup={setDataGroup}
              families={families}
              roleFilter={roleFilter}
              setRoleFilter={setRoleFilter}
              salesSort={salesSort}
              setSalesSort={setSalesSort}
              className="mt-5"
              showRoleFilter={false}
              priorityLabel="Most touchpoints"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1488px] w-full table-fixed text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="sticky left-0 z-10 w-64 border-r border-slate-200 bg-slate-50 px-6 py-3 text-left align-top">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Dataset</div>
                    <div className="mt-3">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          className="field-control py-2.5 pl-9"
                          placeholder="Search datasets"
                        />
                      </div>
                    </div>
                  </th>
                  {stages.map((stage, index) => (
                    <th key={stage} className={`w-28 px-3 py-3 text-center align-top ${stage === selectedStage ? 'bg-orange-50 text-brand-orange' : ''}`}>
                      <div className="text-[11px] font-black uppercase tracking-[0.18em]">Stage {index + 1}</div>
                      <select
                        value={matrixRoleFilters[stage] || 'all'}
                        onChange={(event) => updateMatrixRoleFilter(stage, event.target.value)}
                        className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none transition focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10"
                        aria-label={`Filter ${stage} column`}
                      >
                        {MATRIX_ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {matrixDatasets.length === 0 ? (
                  <tr>
                    <td colSpan={stages.length + 1} className="px-6 py-16 text-center text-sm font-semibold text-slate-400">
                      No datasets match the current stage and matrix filters.
                    </td>
                  </tr>
                ) : (
                  matrixDatasets.map((dataset) => (
                    <tr key={dataset.id}>
                      <td className="sticky left-0 z-[1] w-64 border-r border-slate-200 bg-white px-6 py-4 align-top">
                        <button type="button" onClick={() => setSelectedDatasetId(dataset.id)} className="text-left">
                          <div className="font-black text-brand-navy">{dataset.commonName}</div>
                          <div className="mt-1 text-xs text-slate-400">{dataset.group} | {dataset.supplier}</div>
                        </button>
                      </td>
                      {stages.map((stage) => (
                        <td key={stage} className={`px-4 py-4 text-center ${stage === selectedStage ? 'bg-orange-50/50' : ''}`}>
                          <div className="inline-flex min-w-20 justify-center">
                            <UsageMarker value={getUsageForIndustryStage(dataset, industry, stage)} />
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </ShellCard>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5">
            <ShellCard className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.24em] text-brand-blue">Stage answer</div>
                  <h3 className="mt-2 text-2xl font-black tracking-tight text-brand-navy">{selectedStage}</h3>
                  <p className="mt-2 text-sm leading-7 text-slate-500">
                    Stronger lifecycle classifications are shown first so the answer stays simple and usable during client discussions.
                  </p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Visible now</div>
                  <div className="mt-2 text-3xl font-black text-brand-heading">{stageEntries.length}</div>
                </div>
              </div>
              <SalesControlBar
                search={search}
                setSearch={setSearch}
                availability={availability}
                setAvailability={setAvailability}
                dataGroup={dataGroup}
                setDataGroup={setDataGroup}
                families={families}
                roleFilter={roleFilter}
                setRoleFilter={setRoleFilter}
                salesSort={salesSort}
                setSalesSort={setSalesSort}
                className="mt-5"
                priorityLabel="Role priority"
              />
            </ShellCard>

            {grouped.map((group) =>
              group.items.length > 0 ? (
                <ShellCard key={group.role} className="p-6">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-black text-brand-heading">{roleLabel(group.role)}</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {group.role === 'A'
                          ? 'Used to support decisions, rank options, or test viability.'
                          : group.role === 'B'
                            ? 'Used to orient the site, frame the geography, or support mapping outputs.'
                            : 'Used to explain context, supporting evidence, and briefing notes.'}
                      </p>
                    </div>
                    <div className="rounded-full bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-700">{group.items.length}</div>
                  </div>
                  <div className="space-y-3">
                    {group.items.map(({ dataset, role }) => (
                      <button
                        key={`${dataset.id}-${selectedStage}`}
                        type="button"
                        onClick={() => setSelectedDatasetId(dataset.id)}
                        className={`w-full rounded-3xl border p-4 text-left transition ${
                          selectedRecord?.dataset.id === dataset.id ? 'border-brand-blue bg-sky-50' : 'border-slate-200 bg-white hover:border-brand-sky'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h4 className="text-base font-black text-brand-navy">{dataset.commonName}</h4>
                            <p className="mt-1 text-sm text-slate-500">{dataset.description}</p>
                          </div>
                          <StatusBadge status={dataset.status} />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <RoleBadge role={role} />
                          <AccessBadge access={dataset.openProprietary} />
                        </div>
                        <dl className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
                          <div>
                            <dt className="font-semibold text-slate-500">Data group</dt>
                            <dd>{dataset.group}</dd>
                          </div>
                          <div>
                            <dt className="font-semibold text-slate-500">Supplier</dt>
                            <dd>{dataset.supplier}</dd>
                          </div>
                          <div>
                            <dt className="font-semibold text-slate-500">Coverage</dt>
                            <dd>{dataset.coverage}</dd>
                          </div>
                        </dl>
                        <span className="mt-4 inline-flex text-sm font-semibold text-brand-blue">More information</span>
                      </button>
                    ))}
                  </div>
                </ShellCard>
              ) : null,
            )}

            {weakEntries.length > 0 ? (
              <ShellCard className="border-dashed p-6">
                <div className="mb-4">
                  <h3 className="text-lg font-black text-brand-heading">Lower-confidence or unknown records</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    These are useful when you need to ask for more client detail or identify a knowledge gap.
                  </p>
                </div>
                <div className="space-y-3">
                  {weakEntries.map(({ dataset, role }) => (
                    <button key={dataset.id} type="button" onClick={() => setSelectedDatasetId(dataset.id)} className="w-full rounded-3xl border border-slate-200 bg-slate-50 p-4 text-left hover:border-brand-sky">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-base font-black text-brand-navy">{dataset.commonName}</h4>
                          <p className="mt-1 text-sm text-slate-500">{dataset.description}</p>
                        </div>
                        <RoleBadge role={role} />
                      </div>
                    </button>
                  ))}
                </div>
              </ShellCard>
            ) : null}
          </div>

          <ShellCard className="sticky top-28 self-start p-6">
            {selectedRecord ? (
              <>
                <div className="text-[11px] font-black uppercase tracking-[0.24em] text-brand-blue">More information</div>
                <h3 className="mt-2 text-3xl font-black tracking-tight text-brand-navy">{selectedRecord.dataset.commonName}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-500">{selectedRecord.dataset.description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <StatusBadge status={selectedRecord.dataset.status} />
                  <RoleBadge role={selectedRecord.role} />
                  <AccessBadge access={selectedRecord.dataset.openProprietary} />
                </div>
                <dl className="mt-6 grid gap-4 text-sm text-slate-700">
                  <div>
                    <dt className="font-semibold text-slate-500">Current industry and stage</dt>
                    <dd className="mt-1 font-semibold text-brand-heading">{industry} | {selectedStage}</dd>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <dt className="font-semibold text-slate-500">Data group</dt>
                      <dd className="mt-1">{selectedRecord.dataset.group}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-500">Supplier</dt>
                      <dd className="mt-1">{selectedRecord.dataset.supplier}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-500">Coverage</dt>
                      <dd className="mt-1">{selectedRecord.dataset.coverage}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-500">Business unit</dt>
                      <dd className="mt-1">{selectedRecord.dataset.businessUnit}</dd>
                    </div>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-500">Lifecycle stages where it appears</dt>
                    <dd className="mt-1">
                      {getIndustryStagesUsed(selectedRecord.dataset, industry).join(', ') || 'No other mapped stages'}
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <div className="py-16 text-center text-sm font-semibold text-slate-400">No dataset matches the current stage and filters.</div>
            )}
          </ShellCard>
        </div>
      )}
    </div>
  );
}

function TouchpointSalesWorkspace({ datasets }) {
  const visibleDatasets = useMemo(() => datasets.filter((dataset) => !dataset.isClientOnly), [datasets]);
  const industries = Object.keys(INDUSTRY_STAGES);
  const [industry, setIndustry] = useState('Solar');
  const [search, setSearch] = useState('');
  const [availability, setAvailability] = useState('all');
  const [selectedJurisdictions, setSelectedJurisdictions] = useState(['GB', 'England', 'Scotland', 'Wales']);
  const [activeStage, setActiveStage] = useState('');
  const [selectedTouchpoint, setSelectedTouchpoint] = useState(null);
  const [touchpointRows, setTouchpointRows] = useState([]);
  const [touchpointLoading, setTouchpointLoading] = useState(true);

  const stages = INDUSTRY_STAGES[industry] || [];

  useEffect(() => {
    setActiveStage((current) => current || stages[0] || '');
  }, [stages]);

  useEffect(() => {
    let active = true;
    setTouchpointLoading(true);
    setSelectedTouchpoint(null);
    fetchSalesTouchpointRows(industry, visibleDatasets)
      .then((rows) => {
        if (!active) return;
        setTouchpointRows(rows);
        setTouchpointLoading(false);
      })
      .catch((error) => {
        console.error(error);
        if (!active) return;
        setTouchpointRows([]);
        setTouchpointLoading(false);
      });

    return () => {
      active = false;
    };
  }, [industry, visibleDatasets]);

  const filteredRows = useMemo(() => {
    return touchpointRows.filter(({ dataset, holdingsStatus, gapSource }) => {
      const haystack = [
        dataset.commonName,
        dataset.factor,
        dataset.factorGroup,
        dataset.productFamily,
        dataset.supplier,
        dataset.description,
        dataset.coverage,
      ]
        .join(' ')
        .toLowerCase();

      const matchesSearch = !search || haystack.includes(search.toLowerCase());
      const matchesAvailability =
        availability === 'all' ||
        (availability === 'catalogue' && dataset.status === 'catalogue') ||
        (availability === 'required' && ['desired-gap', 'sme-input', 'client-request'].includes(dataset.status)) ||
        (availability === 'missing-catalogue' && (dataset.status !== 'catalogue' || gapSource.toLowerCase() === 'gap')) ||
        (availability === 'not-productised' && dataset.status !== 'product');

      return matchesSearch && matchesAvailability && Boolean(dataset.commonName) && Boolean(holdingsStatus || gapSource);
    });
  }, [availability, search, touchpointRows]);

  const factorSections = useMemo(() => {
    const grouped = new Map();

    filteredRows.forEach(({ dataset }) => {
      const factorName = dataset.factor || dataset.group || 'Unmapped factor';
      if (!grouped.has(factorName)) {
        grouped.set(factorName, {
          factorName,
          factorGroup: dataset.factorGroup || 'Unclassified',
          productFamilies: new Set(),
          datasets: [],
        });
      }
      const section = grouped.get(factorName);
      section.datasets.push(dataset);
      if (dataset.productFamily) section.productFamilies.add(dataset.productFamily);
      if (section.factorGroup === 'Unclassified' && dataset.factorGroup && dataset.factorGroup !== 'Unclassified') {
        section.factorGroup = dataset.factorGroup;
      }
    });

    return Array.from(grouped.values())
      .sort((left, right) => left.factorName.localeCompare(right.factorName))
      .map((section) => ({
        ...section,
        summary: `Workbook-driven factor used in ${industry} lifecycle touchpoints.`,
        productFamilies: Array.from(section.productFamilies).sort(),
        rows: [...section.datasets]
          .sort((left, right) => {
            const pairCompare =
              normalizePairingName(left.commonName).localeCompare(normalizePairingName(right.commonName)) ||
              accessPriorityValue(left.openProprietary) - accessPriorityValue(right.openProprietary) ||
              left.commonName.localeCompare(right.commonName) ||
              left.productFamily.localeCompare(right.productFamily);
            return pairCompare;
          })
          .map((dataset) => ({
            dataset,
            jurisdictions: inferJurisdictions(dataset),
            cells: stages.reduce((accumulator, stageName) => {
              const role = getUsageForIndustryStage(dataset, industry, stageName);
              accumulator[stageName] = role
                ? {
                    dataset,
                    stageName,
                    role,
                    roleLabel: roleShortLabel(role),
                    jurisdictions: inferJurisdictions(dataset),
                  }
                : null;
              return accumulator;
            }, {}),
        })),
      }));
  }, [filteredRows, industry, stages]);

  function toggleJurisdiction(nextValue) {
    setSelectedTouchpoint(null);
    setSelectedJurisdictions((current) => {
      if (current.includes(nextValue)) {
        return current.length === 1 ? current : current.filter((value) => value !== nextValue);
      }
      return [...current, nextValue];
    });
  }

  function openTouchpoint(touchpoint, factorName) {
    setSelectedTouchpoint({ ...touchpoint, factorName });
  }

  function resetFilters() {
    setSearch('');
    setAvailability('all');
    setSelectedJurisdictions(['GB', 'England', 'Scotland', 'Wales']);
    setSelectedTouchpoint(null);
    setActiveStage(stages[0] || '');
  }

  return (
    <div className="space-y-6">
      <ShellCard className="p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl">
              <div className="text-[11px] font-black uppercase tracking-[0.24em] text-brand-blue">Sales Preview</div>
              <h2 className="mt-3 text-4xl font-black tracking-tight text-brand-navy">Catalogue-led touchpoint matrix</h2>
              <p className="mt-3 text-sm leading-7 text-slate-500">
              This preview keeps the current MVP catalogue-led. Factors now come from the workbook metadata layer, the lifecycle
              stays fixed while you scroll, and product linkage is intentionally out of scope for this page.
              </p>
            </div>
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-4 text-right">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Drawer state</div>
            <div className="mt-2 text-lg font-black text-brand-heading">{selectedTouchpoint ? 'Open' : 'Closed'}</div>
          </div>
        </div>
      </ShellCard>

      <ShellCard className="p-5">
        <div className="grid gap-4 xl:grid-cols-[1.1fr_1.15fr_0.8fr]">
          <FilterField label="Industry vertical">
            <div className="flex flex-wrap gap-3">
              {industries.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setIndustry(option);
                    setSelectedTouchpoint(null);
                    setActiveStage((INDUSTRY_STAGES[option] || [])[0] || '');
                  }}
                  className={`rounded-full border px-4 py-2.5 text-sm font-black tracking-tight transition ${
                    industry === option
                      ? 'border-brand-blue bg-brand-blue text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-brand-sky hover:text-brand-heading'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </FilterField>

          <FilterField label="Project jurisdiction">
            <div className="flex flex-wrap gap-3">
              {['GB', 'England', 'Scotland', 'Wales'].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => toggleJurisdiction(option)}
                  className={`rounded-full border px-4 py-2.5 text-sm font-black tracking-tight transition ${
                    selectedJurisdictions.includes(option)
                      ? 'border-brand-sky bg-sky-50 text-brand-heading'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-brand-sky hover:text-brand-heading'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </FilterField>

          <FilterField label="Matrix options">
            <div className="grid gap-3">
              <select value={availability} onChange={(event) => setAvailability(event.target.value)} className="field-control">
                <option value="all">Show all catalogue states</option>
                <option value="catalogue">Held in catalogue</option>
                <option value="required">Gap / required</option>
                <option value="missing-catalogue">Not in catalogue</option>
              </select>
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-slate-600 transition hover:border-brand-sky hover:text-brand-heading"
              >
                Reset preview
              </button>
            </div>
          </FilterField>
        </div>
      </ShellCard>

      <ShellCard className="overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.24em] text-brand-blue">Lifecycle touchpoint view</div>
              <h3 className="mt-2 text-2xl font-black tracking-tight text-brand-navy">{industry} catalogue touchpoints</h3>
              <p className="mt-2 text-sm leading-7 text-slate-500">
                The stage header below stays sticky while you scroll the factor rows. Click a stage to highlight the column, and click any data touchpoint card to open its detail drawer.
              </p>
            </div>
            <div className="rounded-full bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600">
              {touchpointLoading ? 'Loading workbook logic...' : `${factorSections.length} factors in current view`}
            </div>
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <FilterField label="Search catalogue entries">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="field-control pl-10"
                  placeholder="Search common name, supplier, description, or factor"
                />
              </div>
            </FilterField>
            <div className="flex flex-wrap items-end justify-end gap-2">
              <span className="inline-flex rounded-full border border-green-200 bg-green-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-brand-green">Open authoritative</span>
              <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-brand-blue">Basemapping</span>
              <span className="inline-flex rounded-full border border-green-200 bg-green-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-green-700">Analytical</span>
              <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-slate-600">Context</span>
            </div>
          </div>
        </div>

        <div className="max-h-[72vh] overflow-auto">
          {touchpointLoading ? (
            <div className="flex items-center justify-center p-10 text-sm font-semibold text-slate-500">
              Loading workbook touchpoint logic...
            </div>
          ) : null}
          <table className="min-w-[2120px] w-full table-fixed border-collapse text-sm">
            <thead className="sticky top-0 z-20">
              <tr className="border-b border-slate-300 bg-slate-100 shadow-[inset_0_-1px_0_rgba(203,213,225,0.9)]">
                <th className="sticky left-0 z-30 w-72 border-r border-slate-300 bg-slate-200/95 px-5 py-4 text-left align-top">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-brand-blue">Factors</div>
                  <div className="mt-2 text-sm font-semibold text-slate-600">
                    Workbook-driven factor, factor group, and product family tags
                  </div>
                </th>
                <th className="sticky left-72 z-30 w-72 border-r border-slate-300 bg-slate-100/95 px-5 py-4 text-left align-top">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-brand-blue">Common name</div>
                  <div className="mt-2 text-sm font-semibold text-slate-600">
                    One data row follows one named dataset through the lifecycle
                  </div>
                </th>
                {stages.map((stageName, index) => (
                  <th
                    key={stageName}
                    onClick={() => setActiveStage((current) => (current === stageName ? '' : stageName))}
                    className={`w-52 cursor-pointer border-r border-slate-300 px-4 py-4 text-left align-top transition ${
                      activeStage === stageName ? 'bg-sky-100 text-brand-heading' : 'bg-slate-100 text-slate-600 hover:bg-sky-50'
                    }`}
                  >
                    <div className="text-[11px] font-black uppercase tracking-[0.18em]">Stage {index + 1}</div>
                    <div className="mt-2 text-[13px] font-black leading-5 text-brand-heading">{stageName}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {factorSections.map((section) =>
                section.rows.map((row, rowIndex) => (
                  <tr key={`${section.factorName}-${row.dataset.id}`}>
                    {rowIndex === 0 ? (
                      <td
                        rowSpan={section.rows.length}
                        className="sticky left-0 z-10 w-72 border-r border-slate-200 bg-white px-5 py-5 align-top"
                      >
                        <div className="text-xl font-black tracking-tight text-brand-navy">{section.factorName}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${
                              section.factorGroup === 'Analytical'
                                ? 'border-green-200 bg-green-50 text-green-700'
                                : section.factorGroup === 'Reference'
                                  ? 'border-sky-200 bg-sky-50 text-brand-blue'
                                  : 'border-slate-200 bg-slate-50 text-slate-500'
                            }`}
                          >
                            {section.factorGroup}
                          </span>
                          {section.productFamilies.map((family) => (
                            <span
                              key={`${section.factorName}-${family}`}
                              className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-slate-600"
                            >
                              {family}
                            </span>
                          ))}
                        </div>
                        <p className="mt-3 text-sm leading-7 text-slate-500">{section.summary}</p>
                      </td>
                    ) : null}
                    <td className={`sticky left-72 z-10 w-72 border-r border-slate-200 px-5 py-5 align-top ${rowBandClass(row.dataset.openProprietary)}`}>
                      <div className="text-lg font-black tracking-tight text-brand-navy">{row.dataset.commonName}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <AccessBadge access={row.dataset.openProprietary} />
                        <StatusBadge status={row.dataset.status} />
                      </div>
                      <div className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        {row.jurisdictions.join(', ')}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-500">{row.dataset.description}</p>
                    </td>
                    {stages.map((stageName) => {
                      const touchpoint = row.cells[stageName];
                      const jurisdictionMatch =
                        !selectedJurisdictions.length ||
                        row.jurisdictions.some(
                          (jurisdiction) =>
                            selectedJurisdictions.includes(jurisdiction) ||
                            jurisdiction === 'GB' ||
                            selectedJurisdictions.includes('GB'),
                        );

                      return (
                        <td
                          key={stageName}
                          className={`px-3 py-4 align-top ${rowBandClass(row.dataset.openProprietary)} ${
                            activeStage === stageName ? 'shadow-[inset_0_0_0_9999px_rgba(224,242,254,0.32)]' : ''
                          }`}
                        >
                          {!jurisdictionMatch ? (
                            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                              Outside selected jurisdiction
                            </div>
                          ) : !touchpoint ? (
                            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                              Not used at this stage
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openTouchpoint(touchpoint, section.factorName)}
                              className={`w-full rounded-3xl border p-4 text-left transition ${
                                selectedTouchpoint?.dataset.id === touchpoint.dataset.id &&
                                selectedTouchpoint?.stageName === touchpoint.stageName
                                  ? 'border-brand-blue bg-sky-50'
                                  : touchpoint.dataset.openProprietary === 'open'
                                    ? 'border-fuchsia-200 bg-fuchsia-50/50 hover:border-fuchsia-300'
                                    : touchpoint.dataset.openProprietary === 'proprietary'
                                      ? 'border-sky-200 bg-sky-50/50 hover:border-brand-sky'
                                      : 'border-slate-200 bg-white hover:border-brand-sky hover:bg-slate-50'
                              }`}
                            >
                              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                                {touchpoint.roleLabel} | {touchpoint.jurisdictions.join(', ')}
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <RoleBadge role={touchpoint.role} />
                              </div>
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </ShellCard>

      <div
        className={`fixed inset-0 z-40 transition ${selectedTouchpoint ? 'pointer-events-auto' : 'pointer-events-none'}`}
        aria-hidden={selectedTouchpoint ? 'false' : 'true'}
      >
        <button
          type="button"
          onClick={() => setSelectedTouchpoint(null)}
          className={`absolute inset-0 bg-slate-950/35 transition ${selectedTouchpoint ? 'opacity-100' : 'opacity-0'}`}
        />
        <div
          className={`absolute right-0 top-0 h-full w-full max-w-2xl transform overflow-y-auto border-l border-slate-200 bg-white shadow-2xl transition duration-300 ${
            selectedTouchpoint ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          {selectedTouchpoint ? (
            <div className="min-h-full p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.24em] text-brand-blue">Selected touchpoint</div>
                  <h3 className="mt-3 text-3xl font-black tracking-tight text-brand-navy">{selectedTouchpoint.dataset.commonName}</h3>
                  <div className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                    {selectedTouchpoint.factorName} | {selectedTouchpoint.stageName}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTouchpoint(null)}
                  className="rounded-full border border-slate-200 p-2 text-slate-500 hover:text-slate-700"
                >
                  <X size={16} />
                </button>
              </div>
              <p className="mt-5 text-sm leading-7 text-slate-500">{selectedTouchpoint.dataset.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <RoleBadge role={selectedTouchpoint.role} />
                <AccessBadge access={selectedTouchpoint.dataset.openProprietary} />
                <StatusBadge status={selectedTouchpoint.dataset.status} />
              </div>
              <dl className="mt-6 grid gap-4 text-sm text-slate-700">
                <div>
                  <dt className="font-semibold text-slate-500">Why it matters here</dt>
                  <dd className="mt-1">
                    This catalogue entry is mapped into the {selectedTouchpoint.factorName} factor for {selectedTouchpoint.stageName} in {industry}.
                  </dd>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="font-semibold text-slate-500">Role in stage</dt>
                    <dd className="mt-1">{selectedTouchpoint.roleLabel}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-500">Data group / factor source</dt>
                    <dd className="mt-1">
                      {selectedTouchpoint.dataset.factor || selectedTouchpoint.dataset.group}
                      {selectedTouchpoint.dataset.factorGroup ? ` | ${selectedTouchpoint.dataset.factorGroup}` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-500">Supplier</dt>
                    <dd className="mt-1">{selectedTouchpoint.dataset.supplier}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-500">Product family</dt>
                    <dd className="mt-1">{selectedTouchpoint.dataset.productFamily || 'Not set'}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-500">Coverage / jurisdictions</dt>
                    <dd className="mt-1">{selectedTouchpoint.dataset.coverage} | {selectedTouchpoint.jurisdictions.join(', ')}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-500">Source data id</dt>
                    <dd className="mt-1">{selectedTouchpoint.dataset.sourceDataId || selectedTouchpoint.dataset.id}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-500">Other lifecycle stages</dt>
                    <dd className="mt-1">{getIndustryStagesUsed(selectedTouchpoint.dataset, industry).join(', ') || 'No other mapped stages'}</dd>
                  </div>
                </div>
                <div>
                  <dt className="font-semibold text-slate-500">MVP scope note</dt>
                  <dd className="mt-1">
                    This page is catalogue-led. Product linkage is not yet defined and remains out of scope for this MVP preview.
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

async function fetchDatasetsFromSheets() {
  const [masterResponse, stageResponse] = await Promise.all([
    fetch(`https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:json&sheet=1_Data_Master_Expanded`),
    fetch(`https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:json&sheet=2_Project_Stage_Data`),
  ]);

  if (!masterResponse.ok || !stageResponse.ok) {
    throw new Error(`Sheet sync failed: ${masterResponse.status}/${stageResponse.status}`);
  }

  const masterJson = parseGoogleSheetJson(await masterResponse.text());
  const stageJson = parseGoogleSheetJson(await stageResponse.text());
  const masterRows = sheetTableToObjects(masterJson.table);
  const stageRows = sheetTableToObjects(stageJson.table);

  if (masterRows.length === 0) {
    throw new Error('No rows were returned from the master data sheet.');
  }

  const stageUsageByDataId = stageRows.reduce((accumulator, row) => {
    const dataId = normalizeValue(row.data_id);
    const industryName = normalizeIndustryName(row.project_type);
    const stageName = normalizeStageName(row.stage_name);
    const usedInStage = normalizeValue(row.used_in_stage).toLowerCase();
    const roleCode = normalizeUsageValue(row.role_code || row.stage_data_role);

    if (!dataId || !industryName || !stageName || usedInStage !== 'yes' || !roleCode) {
      return accumulator;
    }

    if (!accumulator[dataId]) accumulator[dataId] = { usage: {}, industryUsage: {} };
    if (!accumulator[dataId].industryUsage[industryName]) {
      accumulator[dataId].industryUsage[industryName] = {};
    }
    accumulator[dataId].industryUsage[industryName][stageName] = roleCode;
    accumulator[dataId].usage[stageName] = mergeRoleValue(accumulator[dataId].usage[stageName], roleCode);
    return accumulator;
  }, {});

  return masterRows.map((row, index) =>
    normaliseDataset(
      {
        ...row,
        sourceDataId: normalizeValue(row.data_id),
        usage: stageUsageByDataId[normalizeValue(row.data_id)]?.usage ?? {},
        industryUsage: stageUsageByDataId[normalizeValue(row.data_id)]?.industryUsage ?? {},
      },
      index,
    ),
  );
}

async function fetchSalesTouchpointRows(industry, fallbackDatasets = []) {
  const gapSheet = GAP_SHEETS[industry];
  if (!gapSheet) return [];

  const [masterResponse, gapResponse] = await Promise.all([
    fetch(`https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:json&sheet=1_Data_Master_Expanded`),
    fetch(`https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:json&sheet=${gapSheet}`),
  ]);

  if (!masterResponse.ok || !gapResponse.ok) {
    throw new Error(`Workbook touchpoint fetch failed: ${masterResponse.status}/${gapResponse.status}`);
  }

  const masterJson = parseGoogleSheetJson(await masterResponse.text());
  const gapJson = parseGoogleSheetJson(await gapResponse.text());
  const masterRows = sheetTableToObjects(masterJson.table);
  const gapRows = gapTableToObjects(gapJson.table);
  const metadataRows = masterRows.map((row, index) => normaliseDataset({ ...row, sourceDataId: normalizeValue(row.data_id) }, index));

  const metadataByName = new Map();
  metadataRows.forEach((dataset) => {
    const key = normalizeStageName(dataset.commonName).toLowerCase();
    if (!key) return;
    if (!metadataByName.has(key)) metadataByName.set(key, []);
    metadataByName.get(key).push(dataset);
  });

  const fallbackByName = new Map();
  fallbackDatasets.forEach((dataset) => {
    const key = normalizeStageName(dataset.commonName).toLowerCase();
    if (!key) return;
    if (!fallbackByName.has(key)) fallbackByName.set(key, []);
    fallbackByName.get(key).push(dataset);
  });

  const stages = INDUSTRY_STAGES[industry] || [];

  return gapRows
    .filter((row) => normalizeValue(row['Common Name']))
    .map((row, index) => {
      const commonName = normalizeValue(row['Common Name']);
      const lookupKey = normalizeStageName(commonName).toLowerCase();
      const meta = metadataByName.get(lookupKey)?.[0] || fallbackByName.get(lookupKey)?.[0] || null;
      const gapSource = normalizeValue(row.Source);
      const stageUsage = stages.reduce((accumulator, stageName) => {
        const marker = normalizeUsageValue(row[normalizeStageName(stageName)]);
        if (marker) accumulator[normalizeStageName(stageName)] = marker;
        return accumulator;
      }, {});

      const dataset = normaliseDataset(
        {
          id: meta?.id || `gap-${industry}-${index}`,
          sourceDataId: meta?.sourceDataId || '',
          commonName,
          product_family: normalizeValue(row['Product Family']) || meta?.productFamily || '',
          Factor: meta?.factor || '',
          'Factor Group': meta?.factorGroup || '',
          Group: meta?.group || normalizeValue(row['Product Family']) || 'Unmapped factor',
          Supplier: meta?.supplier || '',
          Coverage: meta?.coverage || '',
          Description: meta?.description || 'Workbook-defined lifecycle touchpoint row.',
          status: meta?.status || normalizeStatus(row['Holdings Status']),
          openProprietary: meta?.openProprietary || normalizeAccess(gapSource),
          Source: gapSource,
          usage: stageUsage,
          industryUsage: {
            [industry]: stageUsage,
          },
        },
        index,
      );

      return {
        dataset,
        gapSource,
        holdingsStatus: normalizeValue(row['Holdings Status']),
      };
    });
}

function CatalogueWorkspace({ datasets, onSync }) {
  const [showClientData, setShowClientData] = useState(false);
  const [industry, setIndustry] = useState('Housing');
  const [search, setSearch] = useState('');
  const [dataGroup, setDataGroup] = useState('all');
  const [unit, setUnit] = useState('all');
  const [stage, setStage] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [accessFilter, setAccessFilter] = useState('all');
  const [sortBy, setSortBy] = useState('alpha-asc');
  const [selectedId, setSelectedId] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [editUnlocked, setEditUnlocked] = useState(false);
  const [drafts, setDrafts] = useState({});

  const catalogueDatasets = useMemo(
    () => datasets.filter((dataset) => showClientData || !dataset.isClientOnly),
    [datasets, showClientData],
  );
  const groups = useMemo(() => Array.from(new Set(catalogueDatasets.map((dataset) => dataset.group))).sort(), [catalogueDatasets]);

  const filteredDatasets = useMemo(() => {
    const records = catalogueDatasets.filter((dataset) => {
      const haystack = [
        dataset.commonName,
        dataset.rawName,
        dataset.supplier,
        dataset.group,
        dataset.businessUnit,
        dataset.description,
      ]
        .join(' ')
        .toLowerCase();
      const matchesSearch = haystack.includes(search.toLowerCase());
      const matchesGroup = dataGroup === 'all' || dataset.group === dataGroup;
      const matchesUnit = unit === 'all' || dataset.businessUnit === unit;
      const matchesStage = stage === 'all' || Boolean(dataset.usage?.[stage]);
      const matchesStatus = statusFilter === 'all' || dataset.status === statusFilter;
      const matchesAccess = accessFilter === 'all' || dataset.openProprietary === accessFilter;
      return matchesSearch && matchesGroup && matchesUnit && matchesStage && matchesStatus && matchesAccess;
    });

    return records.sort((left, right) => {
      if (sortBy === 'alpha-desc') return right.commonName.localeCompare(left.commonName);
      if (sortBy === 'stages-desc') return right.stageCount - left.stageCount || left.commonName.localeCompare(right.commonName);
      if (sortBy === 'status') return left.status.localeCompare(right.status) || left.commonName.localeCompare(right.commonName);
      return left.commonName.localeCompare(right.commonName);
    });
  }, [accessFilter, catalogueDatasets, dataGroup, search, sortBy, stage, statusFilter, unit]);

  const selectedDataset = useMemo(
    () => filteredDatasets.find((dataset) => dataset.id === selectedId) || filteredDatasets[0] || null,
    [filteredDatasets, selectedId],
  );
  const selectedRecord = selectedDataset ? drafts[selectedDataset.id] || selectedDataset : null;
  const pendingChanges = Object.keys(drafts).length;
  const stages = INDUSTRY_STAGES[industry];

  useEffect(() => {
    if (selectedDataset && selectedDataset.id !== selectedId) {
      setSelectedId(selectedDataset.id);
    }
  }, [selectedDataset, selectedId]);

  useEffect(() => {
    setStage('all');
  }, [industry]);

  async function handleSync() {
    setSyncing(true);
    setSyncError('');
    setSyncMessage('');
    try {
      const result = await onSync();
      setSyncMessage(`Sync complete: ${result.datasetCount} datasets refreshed from Google Sheets.`);
    } catch (error) {
      console.error(error);
      setSyncError('Sync failed. The workbook could not be read or written to Firestore.');
    } finally {
      setSyncing(false);
    }
  }

  function requestEditMode() {
    if (editUnlocked) {
      setEditUnlocked(false);
      setDrafts({});
      return;
    }
    setPasswordError('');
    setShowPasswordPrompt(true);
  }

  function confirmPassword(password) {
    if (password === EDIT_PASSWORD) {
      setEditUnlocked(true);
      setShowPasswordPrompt(false);
      setPasswordError('');
      return;
    }
    setPasswordError('Incorrect password. Use the agreed MVP edit password.');
  }

  function updateDraft(field, value) {
    if (!selectedRecord) return;
    setDrafts((current) => ({
      ...current,
      [selectedRecord.id]: {
        ...selectedRecord,
        [field]: value,
      },
    }));
  }

  return (
    <div className="space-y-8">
      <ShellCard className="p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="text-[11px] font-black uppercase tracking-[0.24em] text-brand-blue">Data</div>
            <h2 className="mt-3 text-4xl font-black tracking-tight text-brand-navy">Catalogue workspace</h2>
            <p className="mt-3 text-sm leading-7 text-slate-500">
              Browse the governed non-client catalogue, filter it the way a data steward actually works, and only unlock editing when you explicitly need to improve the record.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={handleSync} disabled={syncing} className="inline-flex items-center gap-2 rounded-full bg-brand-blue px-5 py-2.5 text-sm font-black uppercase tracking-[0.16em] text-white disabled:opacity-60">
              {syncing ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
              {syncing ? 'Syncing data' : 'Data sync'}
            </button>
            <button
              type="button"
              onClick={() => setShowClientData((current) => !current)}
              className={`inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-black uppercase tracking-[0.16em] ${
                showClientData ? 'border-brand-orange bg-orange-50 text-brand-orange' : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              {showClientData ? 'Hide client data' : 'Show client data'}
            </button>
            <button type="button" onClick={requestEditMode} className={`inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-black uppercase tracking-[0.16em] ${editUnlocked ? 'border-brand-orange bg-orange-50 text-brand-orange' : 'border-slate-200 bg-white text-slate-700'}`}>
              <LockKeyhole size={15} />
              {editUnlocked ? 'Lock editing' : 'Edit mode'}
            </button>
            {pendingChanges > 0 ? (
              <button type="button" className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-5 py-2.5 text-sm font-black uppercase tracking-[0.16em] text-brand-green">
                <CheckCircle2 size={15} />
                {pendingChanges} staged change{pendingChanges === 1 ? '' : 's'}
              </button>
            ) : null}
          </div>
        </div>
        {syncError ? <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600"><AlertTriangle size={14} />{syncError}</div> : null}
        {syncMessage ? <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-brand-green"><CheckCircle2 size={14} />{syncMessage}</div> : null}

        <div className="mt-7 grid gap-4 xl:grid-cols-7">
          <FilterField label="Industry">
            <select value={industry} onChange={(event) => setIndustry(event.target.value)} className="field-control">
              {Object.keys(INDUSTRY_STAGES).map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Common name" className="xl:col-span-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} className="field-control pl-10" placeholder="Search common name, supplier, raw name, or description" />
            </div>
          </FilterField>
          <FilterField label="Data group">
            <select value={dataGroup} onChange={(event) => setDataGroup(event.target.value)} className="field-control">
              <option value="all">All data groups</option>
              {groups.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </FilterField>
          <FilterField label="Business unit">
            <select value={unit} onChange={(event) => setUnit(event.target.value)} className="field-control">
              <option value="all">All business units</option>
              {BUSINESS_UNITS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </FilterField>
          <FilterField label="Lifecycle stage">
            <select value={stage} onChange={(event) => setStage(event.target.value)} className="field-control">
              <option value="all">All lifecycle stages</option>
              {stages.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </FilterField>
          <FilterField label="Sort">
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="field-control">
              <option value="alpha-asc">Alphabetical A-Z</option>
              <option value="alpha-desc">Alphabetical Z-A</option>
              <option value="stages-desc">Most stages first</option>
              <option value="status">Status</option>
            </select>
          </FilterField>
        </div>
      </ShellCard>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <ShellCard className="overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.24em] text-brand-blue">Catalogue records</div>
              <div className="mt-2 text-sm text-slate-500">
                Wider records table with access type, company ownership, and governance filters.
                {!showClientData ? ' Client-only records are hidden by default.' : ' Client-only records are currently visible.'}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <FilterField label="Access type" compact>
                <select value={accessFilter} onChange={(event) => setAccessFilter(event.target.value)} className="field-control">
                  <option value="all">All types</option>
                  <option value="open">Open</option>
                  <option value="proprietary">Proprietary</option>
                  <option value="mixed">Mixed</option>
                  <option value="unknown">Unknown</option>
                </select>
              </FilterField>
              <FilterField label="Status" compact>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="field-control">
                  <option value="all">All statuses</option>
                  <option value="catalogue">Catalogue</option>
                  <option value="product">Product</option>
                  <option value="desired-gap">Desired / gap</option>
                  <option value="sme-input">SME input</option>
                  <option value="client-request">Client request</option>
                </select>
              </FilterField>
              <div className="rounded-full bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">{filteredDatasets.length} visible</div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                  <th className="px-6 py-4">Common name</th>
                  <th className="px-6 py-4">Raw name</th>
                  <th className="px-6 py-4">Data group</th>
                  <th className="px-6 py-4">Supplier</th>
                  <th className="px-6 py-4">Business unit</th>
                  <th className="px-6 py-4">Open / proprietary</th>
                  <th className="px-6 py-4 text-center">Stages</th>
                  <th className="px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDatasets.length === 0 ? (
                  <tr><td colSpan="8" className="px-6 py-20 text-center text-sm font-semibold text-slate-400">No records match the current filters.</td></tr>
                ) : (
                  filteredDatasets.map((dataset) => {
                    const isSelected = selectedRecord?.id === dataset.id;
                    const hasDraft = Boolean(drafts[dataset.id]);
                    return (
                      <tr key={dataset.id} onClick={() => setSelectedId(dataset.id)} className={`cursor-pointer transition ${isSelected ? 'bg-sky-50' : 'hover:bg-slate-50'} ${hasDraft ? 'ring-1 ring-inset ring-brand-orange/30' : ''}`}>
                        <td className="px-6 py-5 align-top">
                          <div className="text-base font-black tracking-tight text-brand-navy">{dataset.commonName}</div>
                          <div className="mt-1 text-sm text-slate-500">{dataset.description.slice(0, 90)}{dataset.description.length > 90 ? '…' : ''}</div>
                        </td>
                        <td className="px-6 py-5 align-top text-xs font-semibold uppercase tracking-wide text-slate-400">{dataset.rawName || 'Not supplied'}</td>
                        <td className="px-6 py-5 align-top text-sm font-semibold text-slate-600">{dataset.group}</td>
                        <td className="px-6 py-5 align-top text-sm font-semibold text-slate-600">{dataset.supplier}</td>
                        <td className="px-6 py-5 align-top text-sm font-semibold text-slate-600">{dataset.businessUnit}</td>
                        <td className="px-6 py-5 align-top"><AccessBadge access={dataset.openProprietary} /></td>
                        <td className="px-6 py-5 align-top text-center text-sm font-black text-brand-navy">{dataset.stageCount}</td>
                        <td className="px-6 py-5 align-top"><StatusBadge status={dataset.status} /></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </ShellCard>

        <ShellCard className="sticky top-28 self-start p-7">
          {selectedRecord ? (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.24em] text-brand-blue">{editUnlocked ? 'Editable record' : 'Record detail'}</div>
                  <h3 className="mt-3 text-3xl font-black tracking-tight text-brand-navy">{selectedRecord.commonName}</h3>
                  <div className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{selectedRecord.rawName || 'No raw source name supplied'}</div>
                </div>
                <StatusBadge status={selectedRecord.status} />
              </div>
              <p className="mt-5 text-sm leading-7 text-slate-500">{selectedRecord.description}</p>

              {editUnlocked ? (
                <div className="mt-7 space-y-4">
                  <EditableField label="Common name"><input value={selectedRecord.commonName} onChange={(event) => updateDraft('commonName', event.target.value)} className="field-control" /></EditableField>
                  <EditableField label="Description"><textarea value={selectedRecord.description} onChange={(event) => updateDraft('description', event.target.value)} className="field-control min-h-[110px]" /></EditableField>
                  <div className="grid gap-4 md:grid-cols-2">
                    <EditableField label="Data group"><input value={selectedRecord.group} onChange={(event) => updateDraft('group', event.target.value)} className="field-control" /></EditableField>
                    <EditableField label="Supplier"><input value={selectedRecord.supplier} onChange={(event) => updateDraft('supplier', event.target.value)} className="field-control" /></EditableField>
                    <EditableField label="Business unit">
                      <select value={selectedRecord.businessUnit} onChange={(event) => updateDraft('businessUnit', event.target.value)} className="field-control">
                        {BUSINESS_UNITS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </EditableField>
                    <EditableField label="Open / proprietary">
                      <select value={selectedRecord.openProprietary} onChange={(event) => updateDraft('openProprietary', event.target.value)} className="field-control">
                        <option value="open">Open</option>
                        <option value="proprietary">Proprietary</option>
                        <option value="mixed">Mixed</option>
                        <option value="unknown">Unknown</option>
                      </select>
                    </EditableField>
                  </div>
                </div>
              ) : (
                <div className="mt-7 grid gap-5 md:grid-cols-2">
                  <DetailItem label="Data group" value={selectedRecord.group} />
                  <DetailItem label="Supplier" value={selectedRecord.supplier} />
                  <DetailItem label="Business unit" value={selectedRecord.businessUnit} />
                  <DetailItem label="Coverage" value={selectedRecord.coverage} />
                  <DetailItem label="Access type" value={selectedRecord.openProprietary} />
                  <DetailItem label="Status" value={statusLabel(selectedRecord.status)} />
                </div>
              )}

              <div className="mt-8 border-t border-slate-100 pt-7">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">Lifecycle touchpoints</div>
                    <div className="mt-2 text-sm font-semibold text-brand-heading">{industry} stages</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {['A', 'B', 'D', 'U'].map((role) => <RoleBadge key={role} role={role} />)}
                  </div>
                </div>
                <div className="space-y-3">
                  {stages.map((stageName) => (
                    <div key={stageName} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="pr-4 text-sm font-semibold text-slate-600">{stageName}</div>
                      <UsageMarker value={selectedRecord.usage?.[stageName]} />
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="py-16 text-center text-sm font-semibold text-slate-400">Select a record to inspect it.</div>
          )}
        </ShellCard>
      </div>

      {showPasswordPrompt ? <PasswordPrompt error={passwordError} onClose={() => { setPasswordError(''); setShowPasswordPrompt(false); }} onSubmit={confirmPassword} /> : null}
    </div>
  );
}

function EditableField({ label, children }) {
  return (
    <div className="rounded-3xl border border-orange-200 bg-orange-50/60 p-4">
      <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</label>
      {children}
    </div>
  );
}

function DetailItem({ label, value }) {
  return (
    <div>
      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className="mt-2 text-sm font-semibold text-brand-navy">{value}</div>
    </div>
  );
}

function SalesControlBar({
  search,
  setSearch,
  searchLabel = 'Search datasets',
  availability,
  setAvailability,
  dataGroup,
  setDataGroup,
  families,
  roleFilter,
  setRoleFilter,
  salesSort,
  setSalesSort,
  className = '',
  showSearch = true,
  showRoleFilter = true,
  sortLabel = 'Sort',
  priorityLabel = 'Role priority',
}) {
  const gridClass = showSearch
    ? showRoleFilter
      ? 'xl:grid-cols-[1.8fr_repeat(3,minmax(0,1fr))]'
      : 'xl:grid-cols-[1.8fr_repeat(2,minmax(0,1fr))]'
    : showRoleFilter
      ? 'xl:grid-cols-4'
      : 'xl:grid-cols-3';

  return (
    <div className={`grid gap-4 rounded-[24px] border border-slate-200 bg-slate-50/90 p-4 ${className}`}>
      <div className={`grid gap-4 ${gridClass}`}>
        {showSearch ? (
          <FilterField label={searchLabel}>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="field-control pl-10"
                  placeholder="Search datasets, suppliers, raw names, or descriptions"
                />
              </div>
              <div className="w-full sm:w-56">
                <label className="sr-only">{sortLabel}</label>
                <div className="relative">
                  <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                  <select value={salesSort} onChange={(event) => setSalesSort(event.target.value)} className="field-control pl-9">
                    <option value="role-priority">{priorityLabel}</option>
                    <option value="alpha-asc">Alphabetical A-Z</option>
                    <option value="alpha-desc">Alphabetical Z-A</option>
                  </select>
                </div>
              </div>
            </div>
          </FilterField>
        ) : null}
        <FilterField label="Availability">
          <select value={availability} onChange={(event) => setAvailability(event.target.value)} className="field-control">
            <option value="all">All data</option>
            <option value="catalogue">In catalogue</option>
            <option value="product">Available as product</option>
            <option value="required">Required / desired</option>
            <option value="missing-catalogue">Not in catalogue</option>
            <option value="not-productised">Not productised</option>
          </select>
        </FilterField>
        <FilterField label="Data theme">
          <select value={dataGroup} onChange={(event) => setDataGroup(event.target.value)} className="field-control">
            <option value="all">All themes</option>
            {families.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </FilterField>
        {showRoleFilter ? (
          <FilterField label="Stage role">
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="field-control">
              <option value="all">All roles</option>
              <option value="A">Analytical</option>
              <option value="B">Basemapping</option>
              <option value="D">Descriptive / contextual</option>
              <option value="U">Unknown / needs classification</option>
            </select>
          </FilterField>
        ) : null}
      </div>
    </div>
  );
}

function LeadershipWorkspace({ datasets, onOpenRole }) {
  const gapItems = datasets.filter((dataset) => dataset.status === 'desired-gap');
  const mostUsed = [...datasets].sort((a, b) => b.stageCount - a.stageCount || a.commonName.localeCompare(b.commonName)).slice(0, 5);
  const businessCounts = BUSINESS_UNITS.map((unit) => ({
    unit,
    count: datasets.filter((dataset) => dataset.businessUnit === unit).length,
  }));

  return (
    <div className="space-y-8">
      <ShellCard className="p-8">
        <div className="text-[11px] font-black uppercase tracking-[0.24em] text-brand-blue">Leadership</div>
        <h2 className="mt-3 text-4xl font-black tracking-tight text-brand-navy">Strategic gaps and catalogue health</h2>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-500">
          This view highlights where the catalogue is strong, where backlog pressure is building, and which desired data items have the broadest lifecycle impact.
        </p>
        <div className="mt-6 flex flex-wrap gap-4">
          <button type="button" onClick={() => onOpenRole('sales')} className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-black uppercase tracking-[0.16em] text-slate-700">
            Open sales journey
          </button>
          <button type="button" onClick={() => onOpenRole('data')} className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-black uppercase tracking-[0.16em] text-slate-700">
            Open data workspace
          </button>
        </div>
      </ShellCard>

      <div className="grid gap-5 xl:grid-cols-4">
        <StatCard label="Desired / gap items" value={gapItems.length} note="Current candidate demand" icon={Sparkles} />
        <StatCard label="Open datasets" value={datasets.filter((d) => d.openProprietary === 'open').length} note="Publicly accessible inputs" icon={ShieldCheck} />
        <StatCard label="Backlog pressure" value={datasets.filter((d) => d.businessUnit === 'Backlog').length} note="Awaiting ownership" icon={Filter} />
        <StatCard label="Unknown roles" value={datasets.filter((d) => Object.values(d.usage || {}).includes('U')).length} note="Needs stronger curation" icon={AlertTriangle} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <ShellCard className="p-6">
          <div className="text-[11px] font-black uppercase tracking-[0.24em] text-brand-blue">Most-used datasets</div>
          <h3 className="mt-2 text-2xl font-black tracking-tight text-brand-navy">Broadest lifecycle coverage</h3>
          <div className="mt-6 space-y-3">
            {mostUsed.map((dataset) => (
              <div key={dataset.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-black text-brand-navy">{dataset.commonName}</div>
                    <div className="mt-1 text-sm text-slate-500">{dataset.group} · {dataset.supplier}</div>
                  </div>
                  <div className="rounded-full bg-white px-3 py-1 text-sm font-black text-brand-heading">{dataset.stageCount} stages</div>
                </div>
              </div>
            ))}
          </div>
        </ShellCard>

        <ShellCard className="p-6">
          <div className="text-[11px] font-black uppercase tracking-[0.24em] text-brand-blue">Business unit profile</div>
          <h3 className="mt-2 text-2xl font-black tracking-tight text-brand-navy">Current catalogue ownership</h3>
          <div className="mt-6 space-y-4">
            {businessCounts.map((entry) => (
              <div key={entry.unit}>
                <div className="mb-2 flex items-center justify-between gap-3 text-sm font-semibold text-slate-600">
                  <span>{entry.unit}</span>
                  <span>{entry.count}</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-brand-blue" style={{ width: `${datasets.length ? (entry.count / datasets.length) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </ShellCard>
      </div>
    </div>
  );
}

export default function App() {
  const [role, setRole] = useState('overview');
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const previewFallback = typeof window !== 'undefined' && ['127.0.0.1', 'localhost'].includes(window.location.hostname);

  useEffect(() => {
    if (previewFallback) return undefined;
    signInAnonymously(auth).catch(console.error);
    return onAuthStateChanged(auth, setUser);
  }, [previewFallback]);

  useEffect(() => {
    if (previewFallback) {
      let active = true;
      fetchDatasetsFromSheets()
        .then((nextDatasets) => {
          if (!active) return;
          setDatasets(nextDatasets);
          setLoading(false);
        })
        .catch((error) => {
          console.error(error);
          if (!active) return;
          setLoading(false);
        });
      return () => {
        active = false;
      };
    }

    if (!user) return undefined;
    const datasetsQuery = query(collection(db, 'artifacts', appId, 'public', 'data', 'datasets'));

    return onSnapshot(
      datasetsQuery,
      (snapshot) => {
        const nextDatasets = snapshot.docs.map((docSnapshot, index) =>
          normaliseDataset({ id: docSnapshot.id, ...docSnapshot.data() }, index),
        );
        setDatasets(nextDatasets);
        setLoading(false);
      },
      (error) => {
        console.error(error);
        setLoading(false);
      },
    );
  }, [previewFallback, user]);

  async function handleSync() {
    const [masterResponse, stageResponse] = await Promise.all([
      fetch(`https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:json&sheet=1_Data_Master_Expanded`),
      fetch(`https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:json&sheet=2_Project_Stage_Data`),
    ]);

    if (!masterResponse.ok || !stageResponse.ok) {
      throw new Error(`Sheet sync failed: ${masterResponse.status}/${stageResponse.status}`);
    }

    const masterJson = parseGoogleSheetJson(await masterResponse.text());
    const stageJson = parseGoogleSheetJson(await stageResponse.text());
    const masterRows = sheetTableToObjects(masterJson.table);
    const stageRows = sheetTableToObjects(stageJson.table);

    if (masterRows.length === 0) {
      throw new Error('No rows were returned from the master data sheet.');
    }

    const stageUsageByDataId = stageRows.reduce((accumulator, row) => {
      const dataId = normalizeValue(row.data_id);
      const industryName = normalizeIndustryName(row.project_type);
      const stageName = normalizeStageName(row.stage_name);
      const usedInStage = normalizeValue(row.used_in_stage).toLowerCase();
      const roleCode = normalizeUsageValue(row.role_code || row.stage_data_role);

      if (!dataId || !industryName || !stageName || usedInStage !== 'yes' || !roleCode) {
        return accumulator;
      }

      if (!accumulator[dataId]) accumulator[dataId] = { usage: {}, industryUsage: {} };
      if (!accumulator[dataId].industryUsage[industryName]) {
        accumulator[dataId].industryUsage[industryName] = {};
      }
      accumulator[dataId].industryUsage[industryName][stageName] = roleCode;
      accumulator[dataId].usage[stageName] = mergeRoleValue(accumulator[dataId].usage[stageName], roleCode);
      return accumulator;
    }, {});

    const batch = writeBatch(db);

    masterRows.forEach((row, index) => {
      const dataset = normaliseDataset(
        {
          ...row,
          sourceDataId: normalizeValue(row.data_id),
          usage: stageUsageByDataId[normalizeValue(row.data_id)]?.usage || {},
          industryUsage: stageUsageByDataId[normalizeValue(row.data_id)]?.industryUsage || {},
        },
        index,
      );
      if (!dataset.rawName && !dataset.commonName) return;
      const ref = doc(db, 'artifacts', appId, 'public', 'data', 'datasets', `ds-${index}`);
      batch.set(ref, {
        sourceDataId: dataset.sourceDataId || normalizeValue(row.data_id),
        name: dataset.rawName,
        commonName: dataset.commonName,
        group: dataset.group,
        factor: dataset.factor,
        factorGroup: dataset.factorGroup,
        productFamily: dataset.productFamily,
        businessUnit: dataset.businessUnit,
        supplier: dataset.supplier,
        description: dataset.description,
        coverage: dataset.coverage,
        source: dataset.source,
        isClientOnly: dataset.isClientOnly,
        status: dataset.status,
        openProprietary: dataset.openProprietary,
        usage: stageUsageByDataId[normalizeValue(row.data_id)]?.usage || {},
        industryUsage: stageUsageByDataId[normalizeValue(row.data_id)]?.industryUsage || {},
        updatedAt: serverTimestamp(),
      });
    });

    await batch.commit();
    return { datasetCount: masterRows.length };
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50">
        <div className="flex h-20 w-20 items-center justify-center rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <Loader2 className="animate-spin text-brand-blue" size={28} />
        </div>
        <div className="text-center">
          <div className="text-[11px] font-black uppercase tracking-[0.28em] text-brand-blue">Idox Geospatial</div>
          <div className="mt-3 text-2xl font-black tracking-tight text-brand-navy">Establishing secure session</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-left text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/92 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1880px] flex-col gap-6 px-6 py-5 xl:px-10">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <LogoMark />
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-3 text-right">
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Current view</div>
              <div className="mt-2 text-base font-black capitalize tracking-tight text-brand-navy">{role}</div>
            </div>
          </div>
          <nav className="flex flex-wrap gap-3">
            {['overview', 'sales', 'data', 'leadership'].map((navRole) => (
              <button
                key={navRole}
                type="button"
                onClick={() => setRole(navRole)}
                className={`rounded-full px-5 py-2.5 text-sm font-black uppercase tracking-[0.16em] transition ${
                  role === navRole ? 'bg-brand-blue text-white' : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                {navRole}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1880px] px-6 py-8 xl:px-10">
        {role === 'overview' ? <OverviewPage datasets={datasets} onOpenRole={setRole} /> : null}
        {role === 'sales' ? <TouchpointSalesWorkspace datasets={datasets} /> : null}
        {role === 'data' ? <CatalogueWorkspace datasets={datasets} onSync={handleSync} /> : null}
        {role === 'leadership' ? <LeadershipWorkspace datasets={datasets} onOpenRole={setRole} /> : null}
      </main>
    </div>
  );
}
