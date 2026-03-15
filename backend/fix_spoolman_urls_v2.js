const url = 'http://localhost:3000';

async function fixFilaments() {
    const settings = await fetch(`${url}/api/settings`).then(r => r.json());
    const filaments = await fetch(`${url}/api/spoolman/filaments`).then(r => r.json());

    // The key that Marathon expects (and Spoolman UI expects if they match)
    const urlKey = settings.url_extra_field || 'url';

    let patched = 0;

    for (const f of filaments) {
        let changed = false;
        let newExtra = { ...(f.extra || {}) };

        // 1. Move from 'url' to urlKey if they differ
        if (urlKey !== 'url' && newExtra.url !== undefined) {
            newExtra[urlKey] = newExtra.url;
            delete newExtra.url;
            changed = true;
        }

        // 2. Clean up any extra fields that got double-quoted strings
        for (const [k, v] of Object.entries(newExtra)) {
            if (typeof v === 'string') {
                try {
                    let parsed = JSON.parse(v);
                    if (typeof parsed === 'string') {
                        // Sometimes the parsed string STILL has quotes because the LLM provided them e.g. '"http..."'
                        let inner = parsed.replace(/^"+/, '').replace(/"+$/, '');
                        let repacked = JSON.stringify(inner);
                        if (repacked !== v) {
                            newExtra[k] = repacked;
                            changed = true;
                        }
                    }
                } catch (e) {
                    // Not valid JSON inside the string, meaning it might be just raw text.
                    // Spoolman requires extra strings to be JSON encoded.
                    let inner = v.replace(/^"+/, '').replace(/"+$/, '');
                    let repacked = JSON.stringify(inner);
                    if (repacked !== v) {
                        newExtra[k] = repacked;
                        changed = true;
                    }
                }
            }
        }

        if (changed) {
            console.log(`Patching filament ${f.id} (${f.name})`);
            const res = await fetch(`${url}/api/spoolman/filaments/${f.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ extra: newExtra })
            });
            if (!res.ok) {
                console.error(`Failed to patch ${f.id}:`, await res.text());
            } else {
                patched++;
            }
        }
    }

    console.log(`Finished checking filaments. Patched ${patched}.`);
}

fixFilaments().catch(console.error);
