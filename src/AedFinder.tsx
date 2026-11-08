import { useState } from 'react';
import { findAeds, type Aed } from './aed';
import { compass, formatDistance } from './geo';
import { Radar } from './Radar';

const RADIUS_M = 1500;

interface Place {
  lat: number;
  lon: number;
  label: string;
}

const PRESETS: Place[] = [
  { lat: 51.5308, lon: -0.1238, label: "King's Cross, London" },
  { lat: 40.758, lon: -73.9855, label: 'Times Square, New York' },
  { lat: 47.6097, lon: -122.3422, label: 'Pike Place, Seattle' },
];

type State =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'loading'; place: Place }
  | { status: 'ready'; place: Place; aeds: Aed[]; source: string }
  | { status: 'error'; message: string; place?: Place };

const directions = (from: Place, to: Aed) =>
  `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${from.lat}%2C${from.lon}%3B${to.lat}%2C${to.lon}`;

export function AedFinder() {
  const [state, setState] = useState<State>({ status: 'idle' });
  const [selected, setSelected] = useState<string | undefined>();

  async function search(place: Place) {
    setState({ status: 'loading', place });
    setSelected(undefined);
    try {
      const result = await findAeds(place.lat, place.lon, RADIUS_M);
      setState({ status: 'ready', place, aeds: result.aeds, source: result.source });
    } catch (err) {
      setState({ status: 'error', place, message: err instanceof Error ? err.message : String(err) });
    }
  }

  function locate() {
    if (!('geolocation' in navigator)) {
      setState({ status: 'error', message: 'This browser cannot share your location. Pick a city below.' });
      return;
    }
    setState({ status: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (pos) => void search({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: 'your location' }),
      (err) =>
        setState({
          status: 'error',
          message: err.code === err.PERMISSION_DENIED ? 'Location is blocked. Allow it in your browser, or pick a city below.' : 'Could not get your location. Try again or pick a city below.',
        }),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }

  const aeds = state.status === 'ready' ? state.aeds.slice(0, 12) : [];

  return (
    <section className="card aed" aria-labelledby="aed-title">
      <h2 id="aed-title">⚡ Nearest defibrillator</h2>
      <p className="muted">
        An AED can restart a heart. If someone else is with you, send them to get one while you push.
      </p>
      <div className="row">
        <button type="button" className="btn primary" onClick={locate} disabled={state.status === 'locating' || state.status === 'loading'}>
          {state.status === 'locating' ? 'Finding you…' : 'Find AEDs near me'}
        </button>
        {PRESETS.map((p) => (
          <button key={p.label} type="button" className="btn" onClick={() => void search(p)} disabled={state.status === 'loading'}>
            {p.label}
          </button>
        ))}
      </div>

      <div aria-live="polite">
        {state.status === 'loading' && <p className="muted">Scanning {formatDistance(RADIUS_M)} around {state.place.label}…</p>}
        {state.status === 'error' && (
          <p className="warn" role="alert">
            {state.message}{' '}
            {state.place && (
              <button type="button" className="link" onClick={() => void search(state.place as Place)}>
                Try again
              </button>
            )}
          </p>
        )}
        {state.status === 'ready' && aeds.length === 0 && (
          <p className="warn">No AEDs are mapped within {formatDistance(RADIUS_M)} of {state.place.label}. Ask the emergency dispatcher; they know where registered AEDs are.</p>
        )}
      </div>

      {state.status === 'ready' && aeds.length > 0 && (
        <div className="aed-grid">
          <Radar
            blips={aeds.map((a) => ({ id: a.id, distance: a.distance, bearing: a.bearing, label: a.name ?? a.where ?? 'AED' }))}
            range={RADIUS_M}
            selected={selected}
            onSelect={setSelected}
          />
          <ol className="aed-list">
            {aeds.map((a) => (
              <li key={a.id} className={a.id === selected ? 'sel' : ''} onMouseEnter={() => setSelected(a.id)}>
                <div className="aed-head">
                  <strong>{a.cluster ? `${a.cluster} defibrillators close together` : (a.name ?? 'Defibrillator')}</strong>
                  <span className="dist">
                    {formatDistance(a.distance)} {compass(a.bearing)}
                  </span>
                </div>
                {a.where && <p>{a.where}</p>}
                <p className="muted small">
                  {[a.indoor === true ? 'indoors' : a.indoor === false ? 'outdoors' : null, a.access ? `access: ${a.access}` : null, a.hours ? `hours: ${a.hours}` : null]
                    .filter(Boolean)
                    .join(' · ') || 'No access details mapped'}
                  {' · '}
                  <a href={directions(state.place, a)} target="_blank" rel="noopener noreferrer">
                    walking directions
                  </a>
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}
      <p className="muted small">
        AED locations come from volunteers on{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
          OpenStreetMap
        </a>{' '}
        (ODbL), served by{' '}
        <a href="https://openaedmap.org/" target="_blank" rel="noopener noreferrer">
          OpenAEDMap
        </a>{' '}
        with Overpass as a backup{state.status === 'ready' ? ` (this list: ${state.source})` : ''}. Not every AED is mapped, and some may be locked or
        moved.
      </p>
    </section>
  );
}
