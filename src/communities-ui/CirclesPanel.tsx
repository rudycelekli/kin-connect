import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  Coffee,
  LockKeyhole,
  MapPin,
  Palette,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import type { OwnerProfile } from '../shared/types';
import { AVAILABILITY_LABELS } from '../shared/types';
import { assessCircle, type Circle, type CircleApplication } from '../communities';
import { circleCatalog } from '../communities/infrastructure';
import { FlowerMark } from '../components/Portrait';
import './circles.css';

type CircleAction = 'simulate-organizer-approval' | 'decline' | 'withdraw';
interface CirclesProps {
  profile: OwnerProfile | null;
  applications: CircleApplication[];
  busy: boolean;
  onStart: () => void;
  onApply: (circleId: string) => Promise<void>;
  onAction: (applicationId: string, action: CircleAction) => Promise<void>;
}
const KIND_LABELS: Record<Circle['kind'], string> = {
  social: 'Good company',
  networking: 'Shared ambition',
  creative: 'Creative company',
};
const KIND_ICONS = { social: Coffee, networking: BriefcaseBusiness, creative: Palette };

export function CirclesPanel({
  profile,
  applications,
  busy,
  onStart,
  onApply,
  onAction,
}: CirclesProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const circle = circleCatalog.find((item) => item.id === selected);
  const assessment = profile && circle ? assessCircle(profile, circle) : null;
  const application = circle
    ? applications.filter((item) => item.circleId === circle.id).at(-1)
    : undefined;
  useEffect(() => {
    setConsent(false);
    setError('');
  }, [selected, profile]);
  async function apply() {
    if (!circle || !assessment?.eligible || !consent) return;
    setError('');
    try {
      await onApply(circle.id);
      setConsent(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply to this fictional circle.');
    }
  }
  async function act(action: CircleAction) {
    if (!application) return;
    setError('');
    try {
      await onAction(application.id, action);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your circle application.');
    }
  }
  return (
    <section className="kc-circles">
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR PEOPLE. A LITTLE MORE TOGETHER.</div>
          <h1>A place to belong.</h1>
          <p>
            Find a small circle around something you care about. Let your agent help with the
            beginning.
          </p>
        </div>
        <span className="kc-demo-label">
          <span />
          Fictional circles · local demo
        </span>
      </div>
      <div className="kc-hero">
        <div>
          <span className="kc-kicker">BEYOND THE FIRST HELLO</span>
          <h2>
            Some things are better
            <br />
            <em>with your kind of people.</em>
          </h2>
          <p>
            A book club. A creative table. People building something.
            <br />
            Your agent checks the fit. You choose what happens next.
          </p>
          {!profile ? (
            <button className="button button-primary" onClick={onStart}>
              Create my agent <ArrowRight size={16} />
            </button>
          ) : (
            <div className="kc-hero-note">
              <ShieldCheck size={17} />
              <span>Nothing is shared until you review and apply.</span>
            </div>
          )}
        </div>
        <CircleArt />
      </div>
      <div className="kc-how" aria-label="How circle introductions work">
        <div>
          <span>01</span>
          <p>
            <strong>Your agent checks the fit.</strong>
            <small>Local policies before any application.</small>
          </p>
        </div>
        <ChevronRight size={17} />
        <div>
          <span>02</span>
          <p>
            <strong>You review a small capsule.</strong>
            <small>Your private profile stays yours.</small>
          </p>
        </div>
        <ChevronRight size={17} />
        <div>
          <span>03</span>
          <p>
            <strong>The organizer decides, too.</strong>
            <small>Two choices make a beginning.</small>
          </p>
        </div>
      </div>
      <div className="kc-section-heading">
        <div>
          <h2>Find your shared thing.</h2>
          <p>Illustrative circles, with clear policies and a reason to come together.</p>
        </div>
        <span>BUILT AROUND PEOPLE</span>
      </div>
      <div className="kc-card-grid">
        {circleCatalog.map((item, index) => {
          const Icon = KIND_ICONS[item.kind];
          const existing = applications.filter((entry) => entry.circleId === item.id).at(-1);
          const restricted = item.paid || !!item.requiredCredential;
          return (
            <article className={`kc-card kc-kind-${item.kind}`} key={item.id}>
              <div className="kc-card-art">
                <span className="kc-kind-label">{KIND_LABELS[item.kind]}</span>
                <div className="kc-card-symbol">
                  <Icon size={34} />
                </div>
                <span className="kc-card-spark kc-spark-one">✳</span>
                <span className="kc-card-spark kc-spark-two">✦</span>
                <span className="kc-card-number">0{index + 1}</span>
              </div>
              <div className="kc-card-body">
                <div className="kc-location">
                  <MapPin size={13} />
                  {item.city || 'Across cities'}
                  <span>·</span>
                  {item.minimumAge}+
                </div>
                <h3>{item.name}</h3>
                <p>{item.description}</p>
                <div className="kc-interest-tags">
                  {item.interests.map((interest) => (
                    <span key={interest}>{interest}</span>
                  ))}
                </div>
                <div className="kc-host">
                  <FlowerMark />
                  <span>
                    Host agent <strong>{item.hostAgentName}</strong>
                  </span>
                </div>
                {restricted && (
                  <div className="kc-unavailable">
                    <LockKeyhole size={14} />
                    <span>
                      {item.paid
                        ? 'Paid membership is not available in this demo.'
                        : 'Credential verification is not available in this demo.'}
                    </span>
                  </div>
                )}
                <div className="kc-card-footer">
                  <span className={existing?.state === 'member' ? 'kc-state-member' : 'kc-state'}>
                    {existing?.state === 'member' ? (
                      <CheckCheck size={14} />
                    ) : existing?.state === 'pending-organizer' ? (
                      <Clock3 size={14} />
                    ) : (
                      <Users size={14} />
                    )}{' '}
                    {existing?.state === 'member'
                      ? 'Demo member'
                      : existing?.state === 'pending-organizer'
                        ? 'Awaiting organizer'
                        : existing?.state === 'withdrawn'
                          ? 'Application withdrawn'
                          : existing?.state === 'declined'
                            ? 'Application declined'
                            : 'An intentional beginning'}
                  </span>
                  <button
                    className="button button-secondary"
                    onClick={() => (profile ? setSelected(item.id) : onStart())}
                  >
                    {existing?.state === 'member'
                      ? 'View membership'
                      : existing?.state === 'pending-organizer'
                        ? 'View application'
                        : 'Review circle'}
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <div className="kc-footer-note">
        <ShieldCheck size={18} />
        <p>
          These circles and organizer conversations are fictional. Applications stay in your local
          browser demo. No live group is contacted, no group chat opens, and no payment or
          credential verification takes place.
        </p>
      </div>
      {circle && assessment && (
        <CircleDialog circle={circle} onClose={() => setSelected(null)}>
          <div className="kc-dialog-intro">
            <span className="kc-demo-label">
              <span />
              Fictional circle · local demo
            </span>
            <p>{circle.description}</p>
            <div className="kc-interest-tags">
              {circle.interests.map((interest) => (
                <span key={interest}>{interest}</span>
              ))}
            </div>
          </div>
          {error && (
            <div className="kc-dialog-error" role="alert">
              <CircleHelp size={17} />
              {error}
            </div>
          )}
          <div className="kc-dialog-section">
            <div className="kc-panel-heading">
              <ShieldCheck size={19} />
              <h3>Your agent’s policy checks</h3>
            </div>
            <div className="kc-check-list">
              {assessment.checks.map((check, index) => (
                <div className={check.passed ? 'passed' : 'failed'} key={`${check.label}-${index}`}>
                  <span>{check.passed ? <Check size={15} /> : <X size={15} />}</span>
                  <div>
                    <strong>{check.label}</strong>
                    <p>{check.detail}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="kc-availability">
              <Clock3 size={15} />
              <span>
                {circle.availability.map((slot) => AVAILABILITY_LABELS[slot]).join(' · ')}
              </span>
            </div>
          </div>
          <div className="kc-dialog-section">
            <div className="kc-panel-heading">
              <Sparkles size={19} />
              <h3>A conversation about fit</h3>
            </div>
            <p className="kc-simulation-copy">
              A transparent local policy simulation between your agent and the fictional host agent.
            </p>
            <div className="kc-message-list">
              {assessment.messages.map((message, index) => (
                <div
                  className={index % 2 ? 'kc-policy-message incoming' : 'kc-policy-message'}
                  key={`${message.from}-${index}`}
                >
                  <FlowerMark />
                  <div>
                    <span>{message.from}</span>
                    <p>{message.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="kc-dialog-section">
            <div className="kc-panel-heading">
              <LockKeyhole size={19} />
              <h3>The exact capsule you’d share</h3>
            </div>
            <p className="kc-simulation-copy">
              Only these fields go into your local application. Your name, age, private
              requirements, and free-text notes stay out of this capsule.
            </p>
            <dl className="kc-disclosures">
              <div>
                <dt>Agent alias</dt>
                <dd>{assessment.disclosures.alias}</dd>
              </div>
              <div>
                <dt>Purpose</dt>
                <dd>{assessment.disclosures.purpose}</dd>
              </div>
              {assessment.disclosures.city && (
                <div>
                  <dt>City</dt>
                  <dd>{assessment.disclosures.city}</dd>
                </div>
              )}
              <div>
                <dt>Shared interests</dt>
                <dd>
                  {assessment.disclosures.interests.length
                    ? assessment.disclosures.interests.join(' · ')
                    : 'No shared interests disclosed'}
                </dd>
              </div>
            </dl>
          </div>
          {application?.state === 'pending-organizer' ? (
            <div className="kc-application-status kc-pending">
              <Clock3 size={23} />
              <div>
                <h3>Your application is in.</h3>
                <p>
                  You approved this capsule. The fictional organizer’s separate approval is still
                  required.
                </p>
                <button
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => act('simulate-organizer-approval')}
                >
                  Simulate organizer approval <Check size={15} />
                </button>
                <small>Explicit demo control. No actual organizer is contacted.</small>
                <button className="text-button" disabled={busy} onClick={() => act('withdraw')}>
                  Withdraw application
                </button>
              </div>
            </div>
          ) : application?.state === 'member' ? (
            <div className="kc-application-status kc-member">
              <CheckCheck size={25} />
              <div>
                <h3>Two choices. A shared beginning.</h3>
                <p>
                  Your demo membership is ready. This is a fictional circle; no live membership or
                  group chat has been created.
                </p>
                <button
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => act('withdraw')}
                >
                  Withdraw demo membership <ArrowRight size={15} />
                </button>
              </div>
            </div>
          ) : !assessment.eligible ? (
            <div className="kc-application-status kc-blocked">
              <LockKeyhole size={23} />
              <div>
                <h3>This circle can’t accept your application.</h3>
                <p>
                  {circle.paid
                    ? 'Billing and paid membership are not supported. No payment is requested.'
                    : circle.requiredCredential
                      ? 'This circle requires a credential that Kin cannot verify. There is no verification service in this demo.'
                      : 'One or more circle policies do not fit your current profile. Your agent does not bypass these checks.'}
                </p>
                <button className="button button-secondary" disabled>
                  Application unavailable
                </button>
              </div>
            </div>
          ) : (
            <div className="kc-application-review">
              <label>
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                />
                <span>I want to apply and share only this capsule.</span>
              </label>
              <p>Applying is your choice. Membership needs the organizer’s separate approval.</p>
              <div>
                <button className="text-button" onClick={() => setSelected(null)}>
                  Maybe another time
                </button>
                <button
                  className="button button-primary"
                  disabled={busy || !consent}
                  onClick={apply}
                >
                  Apply to this circle <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}
        </CircleDialog>
      )}
    </section>
  );
}

function CircleArt() {
  return (
    <div className="kc-circle-art" aria-hidden="true">
      <span className="kc-art-ring" />
      <span className="kc-art-ring second" />
      <div className="kc-art-petal petal-one">
        <Coffee size={31} />
      </div>
      <div className="kc-art-petal petal-two">
        <Palette size={30} />
      </div>
      <div className="kc-art-petal petal-three">
        <BriefcaseBusiness size={28} />
      </div>
      <div className="kc-art-center">
        <FlowerMark />
      </div>
      <span className="kc-art-star">✦</span>
      <span className="kc-art-caption">a little more together</span>
    </div>
  );
}
function CircleDialog({
  circle,
  onClose,
  children,
}: {
  circle: Circle;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null),
    closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key === 'Tab') {
        const items = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),a[href],[tabindex="0"]',
          ) || [],
        );
        const first = items[0],
          last = items.at(-1);
        if (!ref.current?.contains(document.activeElement)) {
          event.preventDefault();
          first?.focus();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', keydown);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="kc-dialog-overlay"
      onClick={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="kc-dialog-title"
        className="kc-dialog"
      >
        <div className="kc-dialog-header">
          <div>
            <span className="eyebrow">A PLACE FOR YOUR SHARED THING</span>
            <h2 id="kc-dialog-title">{circle.name}</h2>
          </div>
          <button className="icon-button" aria-label="Close circle review" onClick={onClose}>
            <X size={21} />
          </button>
        </div>
        <div className="kc-dialog-body">{children}</div>
      </div>
    </div>
  );
}
export default CirclesPanel;
