import { useState } from 'react';
import { CircleHelp, HeartHandshake, LockKeyhole, Trash2 } from 'lucide-react';
import type { SavedConnection } from '../shared/types';
import { FlowerMark } from '../components/Portrait';
import './circles.css';

export function SavedConnectionsPanel({
  connections,
  busy,
  onRemove,
}: {
  connections: SavedConnection[];
  busy: boolean;
  onRemove: (peerId: string) => Promise<void>;
}) {
  const [error, setError] = useState('');
  async function remove(peerId: string) {
    setError('');
    try {
      await onRemove(peerId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove this saved connection.');
    }
  }
  function savedDate(value: string) {
    const date = new Date(value);
    return Number.isFinite(date.valueOf())
      ? date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      : 'Date unavailable';
  }
  return (
    <section className="kc-saved-connections" aria-labelledby="kc-saved-heading">
      <div className="kc-saved-heading">
        <div>
          <div className="eyebrow">GOOD BEGINNINGS, KEPT CLOSE</div>
          <h2 id="kc-saved-heading">Your private circle</h2>
          <p>
            Approved network aliases you chose to save in this browser. A small way to remember a
            good beginning.
          </p>
        </div>
        <span>
          <LockKeyhole size={14} />
          On this device
        </span>
      </div>
      {error && (
        <div className="kc-dialog-error" role="alert">
          <CircleHelp size={17} />
          {error}
        </div>
      )}
      {connections.length === 0 ? (
        <div className="kc-saved-empty">
          <div>
            <FlowerMark />
          </div>
          <h3>A little room for the people you meet.</h3>
          <p>After both owners approve an introduction, save that connection from Live network.</p>
        </div>
      ) : (
        <ul className="kc-saved-list">
          {connections.map((connection) => (
            <li key={connection.peerId}>
              <div className="kc-saved-avatar">
                <HeartHandshake size={22} />
              </div>
              <div className="kc-saved-person">
                <h3>{connection.alias}</h3>
                <span>Saved {savedDate(connection.savedAt)}</span>
              </div>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => remove(connection.peerId)}
                aria-label={`Remove saved connection with ${connection.alias}`}
              >
                <Trash2 size={14} />
                <span>Remove saved connection</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="kc-saved-note">
        <LockKeyhole size={16} />
        <p>
          Saving an alias gives no community membership, invitation, or new messaging permission.
          This list is private to your browser; nothing is sent to another person or organizer.
        </p>
      </div>
    </section>
  );
}
export default SavedConnectionsPanel;
