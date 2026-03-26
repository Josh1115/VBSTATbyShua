import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Drawer } from '../ui/Drawer';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ResetRotationModal } from './ResetRotationModal';
import { useMatchStore } from '../../store/matchStore';
import { db } from '../../db/schema';
import { SIDE } from '../../constants';

export function MenuDrawer({ onClose, flipLayout = false, onFlipLayout }) {
  const matchId         = useMatchStore((s) => s.matchId);
  const currentSetId    = useMatchStore((s) => s.currentSetId);
  const ourScore        = useMatchStore((s) => s.ourScore);
  const oppScore        = useMatchStore((s) => s.oppScore);
  const endSet          = useMatchStore((s) => s.endSet);
  const endMatch        = useMatchStore((s) => s.endMatch);
  const resetCurrentSet  = useMatchStore((s) => s.resetCurrentSet);
  const resetToRotation  = useMatchStore((s) => s.resetToRotation);
  const navigate         = useNavigate();

  const [confirmReset,        setConfirmReset]        = useState(false);
  const [confirmMatchSetup,   setConfirmMatchSetup]   = useState(false);
  const [confirmEndSet,       setConfirmEndSet]       = useState(false);
  const [resetRotationOpen,   setResetRotationOpen]   = useState(false);

  const computeWinner = () => {
    if (ourScore === 0 && oppScore === 0) return null;
    return ourScore >= oppScore ? SIDE.US : SIDE.THEM;
  };

  const handleEndSetConfirmed = async () => {
    await endSet(computeWinner());
    navigate(`/matches/${matchId}/set-lineup`);
  };

  const handleEndMatch = async () => {
    await endMatch(computeWinner());
    navigate(`/matches/${matchId}/summary`);
  };

  const handleResetConfirmed = async () => {
    await resetCurrentSet();
    setConfirmReset(false);
    onClose();
  };

  const handleMatchSetupConfirmed = async () => {
    // Persist current scores to DB so the set record reflects progress
    if (currentSetId) {
      await db.sets.update(currentSetId, { our_score: ourScore, opp_score: oppScore });
    }
    navigate(`/matches/${matchId}/set-lineup`);
  };

  return (
    <>
      <Drawer title="Match Menu" onClose={onClose}>
        <div className="flex items-center justify-between py-3 mb-3 border-b border-slate-700">
          <div>
            <div className="text-sm font-medium text-white">Flip Team Layout</div>
            <div className="text-xs text-slate-400 mt-0.5">Show your team on the right side</div>
          </div>
          <button
            onClick={onFlipLayout}
            className={`relative w-11 h-6 rounded-full transition-colors ${flipLayout ? 'bg-primary' : 'bg-slate-600'}`}
            aria-checked={flipLayout}
            role="switch"
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${flipLayout ? 'translate-x-5' : ''}`} />
          </button>
        </div>
        <div className="space-y-3">
          <Button variant="secondary" className="w-full justify-start" onClick={() => setConfirmMatchSetup(true)}>
            Match Set Up
          </Button>
          <Button variant="secondary" className="w-full justify-start" onClick={() => setResetRotationOpen(true)}>
            Reset to Rotation
          </Button>
          <Button variant="secondary" className="w-full justify-start" onClick={() => setConfirmReset(true)}>
            Reset Current Set
          </Button>
          <Button variant="secondary" className="w-full justify-start" onClick={() => setConfirmEndSet(true)}>
            End Current Set
          </Button>
          <Button variant="danger" className="w-full justify-start" onClick={handleEndMatch}>
            End Match
          </Button>
        </div>
      </Drawer>

      {confirmMatchSetup && (
        <ConfirmDialog
          title="Go to Match Set Up?"
          message="Your current score and rotation state will be saved. You can fix the lineup and return to the match."
          confirmLabel="Go to Set Up"
          onConfirm={handleMatchSetupConfirmed}
          onCancel={() => setConfirmMatchSetup(false)}
        />
      )}

      {confirmEndSet && (
        <ConfirmDialog
          title="End Current Set?"
          message={`${ourScore === 0 && oppScore === 0 ? 'Tie' : 'Final'} score: ${ourScore} – ${oppScore}. This will end the set and take you to the lineup screen for the next set.`}
          confirmLabel="End Set"
          onConfirm={handleEndSetConfirmed}
          onCancel={() => setConfirmEndSet(false)}
        />
      )}

      {confirmReset && (
        <ConfirmDialog
          title="Reset Current Set?"
          message="This will delete all points, contacts, and substitutions for the current set and reset the score to 0–0. This cannot be undone."
          confirmLabel="Reset Set"
          danger
          onConfirm={handleResetConfirmed}
          onCancel={() => setConfirmReset(false)}
        />
      )}

      {resetRotationOpen && (
        <ResetRotationModal
          onCancel={() => setResetRotationOpen(false)}
          onConfirm={async (rotNum, serving) => {
            await resetToRotation(rotNum, serving);
            setResetRotationOpen(false);
            onClose();
          }}
        />
      )}
    </>
  );
}
