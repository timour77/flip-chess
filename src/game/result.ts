/** Maps a finished Lichess game's status/winner into end-of-game display text. */
import type { Color, GameResult, GameStatus } from '../types';

export function describeResult(status: GameStatus, winner: Color | null, myColor: Color): GameResult {
  const wonByMe = winner === myColor;

  switch (status) {
    case 'mate':
      return { outcome: wonByMe ? 'win' : 'loss', reason: 'Checkmate' };
    case 'resign':
      return { outcome: wonByMe ? 'win' : 'loss', reason: wonByMe ? 'Opponent resigned' : 'You resigned' };
    case 'outoftime':
    case 'timeout':
      return { outcome: winner === null ? 'draw' : wonByMe ? 'win' : 'loss', reason: 'Out of time' };
    case 'stalemate':
      return { outcome: 'draw', reason: 'Stalemate' };
    case 'draw':
      return { outcome: 'draw', reason: 'Draw' };
    case 'aborted':
      return { outcome: 'aborted', reason: 'Game aborted' };
    case 'noStart':
      return { outcome: 'aborted', reason: 'Game did not start' };
    case 'cheat':
      return { outcome: winner === null ? 'aborted' : wonByMe ? 'win' : 'loss', reason: 'Cheat detected' };
    case 'variantEnd':
      return { outcome: winner === null ? 'draw' : wonByMe ? 'win' : 'loss', reason: 'Game over' };
    case 'unknownFinish':
      return { outcome: winner === null ? 'draw' : wonByMe ? 'win' : 'loss', reason: 'Game ended' };
    case 'created':
    case 'started':
      return { outcome: 'aborted', reason: 'Game in progress' };
    default: {
      const exhaustiveCheck: never = status;
      return { outcome: 'aborted', reason: `Unknown status: ${String(exhaustiveCheck)}` };
    }
  }
}
