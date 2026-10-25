/**
 * Where to pick a series up again, from the last episode of it a viewer
 * touched. Unfinished: that episode, where they stopped. Finished: the next
 * one out. Nothing after it yet: nothing to continue, until there is.
 */

export interface LastWatched {
  videoId: string;
  episodeNumber: number | null;
  positionSec: number;
  durationSec: number;
  completed: boolean;
}

export interface EpisodeRef {
  id: string;
  episodeNumber: number | null;
}

export interface ContinuePoint {
  videoId: string;
  episodeNumber: number | null;
  /** Seconds into it; 0 for an episode not started. */
  positionSec: number;
  /** 0–1 through that episode, for the progress bar. */
  progress: number;
}

/**
 * The last few seconds are credits: stopping there is finishing. Five
 * seconds, or a tenth of the episode if that is less, so a short episode is
 * not "finished" half-way through.
 */
function endSlack(durationSec: number): number {
  return Math.min(5, durationSec * 0.1);
}

export function isFinished(last: Pick<LastWatched, "positionSec" | "durationSec" | "completed">): boolean {
  // With no known length, the player saying it ended is all there is to go on.
  if (last.durationSec <= 0) return last.completed;
  const slack = endSlack(last.durationSec);
  const nearEnd = last.positionSec >= last.durationSec - slack;
  // Finished once and not restarted since: the position went back to the start.
  const finishedAndReset = last.completed && last.positionSec < Math.max(1, slack);
  return nearEnd || finishedAndReset;
}

/** `episodes` are the ones a viewer can see, in order. */
export function continuePoint(last: LastWatched, episodes: EpisodeRef[]): ContinuePoint | null {
  if (!isFinished(last)) {
    return {
      videoId: last.videoId,
      episodeNumber: last.episodeNumber,
      positionSec: last.positionSec,
      progress: last.durationSec > 0 ? Math.min(1, last.positionSec / last.durationSec) : 0,
    };
  }
  const index = episodes.findIndex((episode) => episode.id === last.videoId);
  const next =
    index >= 0
      ? episodes[index + 1]
      : // The episode went private or away: the first one numbered after it.
        episodes.find((episode) => (episode.episodeNumber ?? 0) > (last.episodeNumber ?? 0));
  return next ? { videoId: next.id, episodeNumber: next.episodeNumber, positionSec: 0, progress: 0 } : null;
}
