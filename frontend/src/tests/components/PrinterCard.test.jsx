/**
 * Unit tests for PrinterCard component.
 * Covers all visible printer states: offline, idle, printing, paused.
 * API calls and CSS scraping are mocked — no network access.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import PrinterCard from '../../components/dashboard/PrinterCard';

vi.mock('../../api/control', () => ({
  pausePrint: vi.fn(),
  resumePrint: vi.fn(),
  cancelPrint: vi.fn(),
  sendGcode: vi.fn(),
  getMacros: vi.fn().mockResolvedValue([]),
  controlLight: vi.fn(),
  getWebcams: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../services/themeScraper', () => ({
  getCachedCss: vi.fn().mockReturnValue(null),
  getScrapeError: vi.fn().mockReturnValue(null),
  scrapeTheme: vi.fn().mockResolvedValue({ css: null, error: null }),
}));

const BASE_PRINTER = {
  id: 1,
  name: 'Test Printer',
  host: '192.168.1.100',
  port: 7125,
  firmware_type: 'klipper',
  theme_mode: 'global',
  custom_css: '',
  toolhead_count: 1,
};

function renderCard(printer = BASE_PRINTER, status = null) {
  return render(
    <MemoryRouter>
      <PrinterCard printer={printer} status={status} />
    </MemoryRouter>
  );
}

// ── Basic rendering ────────────────────────────────────────────────────────

describe('PrinterCard — always', () => {
  it('displays the printer name', () => {
    renderCard();
    expect(screen.getByText('Test Printer')).toBeInTheDocument();
  });

  it('renders queue and mainsail links', () => {
    renderCard(BASE_PRINTER, { _online: true, print_stats: { state: 'standby', filename: '' }, display_status: { progress: 0 } });
    expect(screen.getByText(/View Queue/i)).toBeInTheDocument();
    expect(screen.getByText(/Open Mainsail/i)).toBeInTheDocument();
  });
});

// ── Offline ────────────────────────────────────────────────────────────────

describe('PrinterCard — offline', () => {
  it('shows Offline badge when status is null', () => {
    renderCard();
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('shows Offline badge when _online is false', () => {
    renderCard(BASE_PRINTER, { _online: false });
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('does not show temperature controls when offline', () => {
    renderCard(BASE_PRINTER, { _online: false });
    expect(screen.queryByText(/°C/i)).not.toBeInTheDocument();
  });
});

// ── Idle / standby ─────────────────────────────────────────────────────────

describe('PrinterCard — idle', () => {
  const IDLE_STATUS = {
    _online: true,
    print_stats: { state: 'standby', filename: '' },
    display_status: { progress: 0 },
    extruder: { temperature: 25, target: 0 },
    heater_bed: { temperature: 24, target: 0 },
  };

  it('shows Idle badge', () => {
    renderCard(BASE_PRINTER, IDLE_STATUS);
    expect(screen.getByText('Idle')).toBeInTheDocument();
  });

  it('shows extruder temperature', () => {
    renderCard(BASE_PRINTER, IDLE_STATUS);
    expect(screen.getByText(/25/)).toBeInTheDocument();
  });

  it('does not show Pause or Cancel buttons', () => {
    renderCard(BASE_PRINTER, IDLE_STATUS);
    expect(screen.queryByRole('button', { name: /pause/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
  });
});

// ── Printing ───────────────────────────────────────────────────────────────

describe('PrinterCard — printing', () => {
  const PRINTING_STATUS = {
    _online: true,
    print_stats: { state: 'printing', filename: 'benchy.gcode' },
    display_status: { progress: 0.42 },
    extruder: { temperature: 220, target: 220 },
    heater_bed: { temperature: 65, target: 65 },
  };

  it('shows Printing badge', () => {
    renderCard(BASE_PRINTER, PRINTING_STATUS);
    expect(screen.getByText('Printing')).toBeInTheDocument();
  });

  it('shows filename', () => {
    renderCard(BASE_PRINTER, PRINTING_STATUS);
    expect(screen.getByText(/benchy\.gcode/i)).toBeInTheDocument();
  });

  it('shows Pause button', () => {
    renderCard(BASE_PRINTER, PRINTING_STATUS);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('shows Cancel button', () => {
    renderCard(BASE_PRINTER, PRINTING_STATUS);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('does not show Resume button', () => {
    renderCard(BASE_PRINTER, PRINTING_STATUS);
    expect(screen.queryByRole('button', { name: /resume/i })).not.toBeInTheDocument();
  });

  it('shows extruder temperature at target', () => {
    renderCard(BASE_PRINTER, PRINTING_STATUS);
    expect(screen.getAllByText(/220/).length).toBeGreaterThan(0);
  });
});

// ── Paused ─────────────────────────────────────────────────────────────────

describe('PrinterCard — paused', () => {
  const PAUSED_STATUS = {
    _online: true,
    print_stats: { state: 'paused', filename: 'benchy.gcode' },
    display_status: { progress: 0.42 },
    extruder: { temperature: 220, target: 220 },
    heater_bed: { temperature: 65, target: 65 },
  };

  it('shows Paused badge', () => {
    renderCard(BASE_PRINTER, PAUSED_STATUS);
    expect(screen.getByText('Paused')).toBeInTheDocument();
  });

  it('shows Resume button', () => {
    renderCard(BASE_PRINTER, PAUSED_STATUS);
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
  });

  it('shows Cancel button', () => {
    renderCard(BASE_PRINTER, PAUSED_STATUS);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('does not show Pause button when paused', () => {
    renderCard(BASE_PRINTER, PAUSED_STATUS);
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
  });

  it('still shows filename while paused', () => {
    renderCard(BASE_PRINTER, PAUSED_STATUS);
    expect(screen.getByText(/benchy\.gcode/i)).toBeInTheDocument();
  });
});

// ── Bambu printer ──────────────────────────────────────────────────────────

describe('PrinterCard — Bambu firmware', () => {
  const BAMBU = { ...BASE_PRINTER, id: 2, name: 'X1 Carbon', firmware_type: 'bambu' };

  it('renders Bambu printer name', () => {
    renderCard(BAMBU, { _online: true, print_stats: { state: 'standby', filename: '' }, display_status: { progress: 0 } });
    expect(screen.getByText('X1 Carbon')).toBeInTheDocument();
  });
});
