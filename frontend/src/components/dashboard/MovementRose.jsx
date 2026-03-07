import { useState } from 'react';
import { sendGcode } from '../../api/control';

// Math helper to draw an annular sector (a curved slice of a donut)
function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
        x: centerX + radius * Math.cos(angleInRadians),
        y: centerY + radius * Math.sin(angleInRadians),
    };
}

function describeAnnularSector(x, y, innerRadius, outerRadius, startAngle, endAngle) {
    const startOut = polarToCartesian(x, y, outerRadius, endAngle);
    const endOut = polarToCartesian(x, y, outerRadius, startAngle);
    const startIn = polarToCartesian(x, y, innerRadius, endAngle);
    const endIn = polarToCartesian(x, y, innerRadius, startAngle);

    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

    return [
        'M', startOut.x, startOut.y,
        'A', outerRadius, outerRadius, 0, largeArcFlag, 0, endOut.x, endOut.y,
        'L', endIn.x, endIn.y,
        'A', innerRadius, innerRadius, 0, largeArcFlag, 1, startIn.x, startIn.y,
        'Z'
    ].join(' ');
}

export default function MovementRose({ printerId, printerType }) {
    const [busy, setBusy] = useState(false);
    const [eDist, setEDist] = useState(10);
    const isBambu = printerType === 'bambu';

    // Jog function (relative movement)
    const jog = async (axis, distance, feedrate = 3000) => {
        if (busy) return;
        setBusy(true);
        // G91: Relative positioning
        // G1: Move
        // G90: Absolute positioning
        const script = `G91\nG1 ${axis}${distance} F${feedrate}\nG90`;
        try {
            await sendGcode(printerId, script);
        } catch (e) {
            alert(e.message);
        } finally {
            setBusy(false);
        }
    };

    const home = async (axes = 'X Y') => {
        if (busy) return;
        setBusy(true);
        try {
            await sendGcode(printerId, `G28 ${axes}`);
        } catch (e) {
            alert(e.message);
        } finally {
            setBusy(false);
        }
    };

    // 4 directions. Angles (top is 0 degrees, clockwise):
    // +Y (Up):     315 to  45
    // +X (Right):   45 to 135
    // -Y (Down):   135 to 225
    // -X (Left):   225 to 315
    const wedges = [
        { axis: 'Y', dir: 1, label: '+Y', start: 315, end: 45 },
        { axis: 'X', dir: 1, label: '+X', start: 45, end: 135 },
        { axis: 'Y', dir: -1, label: '-Y', start: 135, end: 225 },
        { axis: 'X', dir: -1, label: '-X', start: 225, end: 315 },
    ];

    return (
        <div className={`movement-panel ${isBambu ? 'orca-theme' : ''}`}>
            {/* XY Rose */}
            <div className="movement-rose-container">
                <svg viewBox="0 0 240 240" className="movement-rose-svg">
                    {/* Inner rings (1mm) */}
                    {wedges.map((w, i) => (
                        <g key={`inner-${i}`} onClick={() => jog(w.axis, 1 * w.dir)} className="rose-wedge">
                            <path d={describeAnnularSector(120, 120, 26, 52, w.start, w.end)} />
                            <text {...polarToCartesian(120, 120, 39, (w.start + w.end) / 2)} fill="currentColor" fontSize="11" textAnchor="middle" dominantBaseline="middle">
                                {w.dir > 0 ? '+' : '-'}1
                            </text>
                        </g>
                    ))}

                    {/* Middle rings (10mm) */}
                    {wedges.map((w, i) => (
                        <g key={`mid-${i}`} onClick={() => jog(w.axis, 10 * w.dir)} className="rose-wedge">
                            <path d={describeAnnularSector(120, 120, 54, 80, w.start, w.end)} />
                            <text {...polarToCartesian(120, 120, 67, (w.start + w.end) / 2)} fill="currentColor" fontSize="12" fontWeight="bold" textAnchor="middle" dominantBaseline="middle">
                                {w.dir > 0 ? '+' : '-'}10
                            </text>
                        </g>
                    ))}

                    {/* Outer rings (100mm) */}
                    {wedges.map((w, i) => (
                        <g key={`outer-${i}`} onClick={() => jog(w.axis, 100 * w.dir)} className="rose-wedge">
                            <path d={describeAnnularSector(120, 120, 82, 108, w.start, w.end)} />
                            <text {...polarToCartesian(120, 120, 95, (w.start + w.end) / 2)} fill="currentColor" fontSize="12" fontWeight="bold" textAnchor="middle" dominantBaseline="middle">
                                {w.dir > 0 ? '+' : '-'}100
                            </text>
                        </g>
                    ))}

                    {/* External Axis Labels */}
                    {wedges.map((w, i) => (
                        <text key={`label-${i}`} {...polarToCartesian(120, 120, 116, (w.start + w.end) / 2)} fill="var(--text-muted)" fontSize="13" fontWeight="bold" textAnchor="middle" dominantBaseline="middle">
                            {w.label}
                        </text>
                    ))}

                    {/* Center Home Button */}
                    <g onClick={() => home('X Y')} className="rose-home">
                        <circle cx="120" cy="120" r="24" />
                        <path className="home-icon-path" d="M90 102v6h20v-6h5l-15-12-15 12h5zm15-4.5V93h-4v2.3l-1 1-1-1V93h-4v4.5l5 4 5-4z" transform="translate(20, 15)" />
                        <text className="home-icon-text" x="120" y="125" fontSize="10" fontWeight="bold" textAnchor="middle">XY</text>
                    </g>
                </svg>
            </div>

            {/* Z Controls */}
            <div className="movement-z-container">
                <div className="z-label">Z</div>
                <button className="z-btn" onClick={() => jog('Z', 50)} disabled={busy}>+50</button>
                <button className="z-btn" onClick={() => jog('Z', 10)} disabled={busy}>+10</button>
                <button className="z-btn" onClick={() => jog('Z', 1)} disabled={busy}>+1</button>
                <button className="z-btn btn-home-z" onClick={() => home('Z')} disabled={busy}>
                    <span className="home-icon-text" style={{ fontWeight: 'bold' }}>⌂ Z</span>
                </button>
                <button className="z-btn" onClick={() => jog('Z', -1)} disabled={busy}>-1</button>
                <button className="z-btn" onClick={() => jog('Z', -10)} disabled={busy}>-10</button>
                <button className="z-btn" onClick={() => jog('Z', -50)} disabled={busy}>-50</button>
            </div>

            {/* Extruder Controls */}
            <div className="movement-e-container">
                <div className="e-label">Extruder</div>
                <div className="e-btn-row" style={{ display: 'flex', gap: '4px' }}>
                    <button className="e-btn" onClick={() => jog('E', -eDist, 300)} disabled={busy} title="Retract">▲</button>
                    <button className="e-btn" onClick={() => jog('E', eDist, 300)} disabled={busy} title="Extrude">▼</button>
                </div>
                <div className="e-step-group" style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                    {[5, 10, 50].map(val => (
                        <button
                            key={val}
                            className={`e-step-btn ${eDist === val ? 'active' : ''}`}
                            onClick={() => setEDist(val)}
                        >
                            {val}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
