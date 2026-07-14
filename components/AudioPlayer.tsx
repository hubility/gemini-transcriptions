import { Icon } from './Icon';
import { formatDuration } from '../utils/audioUtils';

interface AudioPlayerProps {
  audioUrl: string;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  playbackRate: number;
  onCurrentTimeChange: (time: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onPlaybackRateChange: (rate: number) => void;
}

export function AudioPlayer({
  audioUrl,
  audioRef,
  currentTime,
  duration,
  isPlaying,
  playbackRate,
  onCurrentTimeChange,
  onPlayingChange,
  onPlaybackRateChange,
}: AudioPlayerProps) {
  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) await audio.play();
    else audio.pause();
  };

  const seek = (time: number) => {
    if (audioRef.current) audioRef.current.currentTime = time;
    onCurrentTimeChange(time);
  };

  const changeRate = (rate: number) => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
    onPlaybackRateChange(rate);
  };

  return (
    <div className="audio-player">
      <audio
        ref={audioRef}
        src={audioUrl}
        onEnded={() => onPlayingChange(false)}
        onPause={() => onPlayingChange(false)}
        onPlay={() => onPlayingChange(true)}
        onTimeUpdate={(event) => onCurrentTimeChange(event.currentTarget.currentTime)}
      />
      <button className="player-button" type="button" onClick={togglePlayback} aria-label={isPlaying ? 'Pausar' : 'Reproducir'}>
        <Icon name={isPlaying ? 'pause' : 'play'} size={19} />
      </button>
      <span className="player-time">{formatDuration(currentTime, duration >= 3600)}</span>
      <input
        aria-label="Posición del audio"
        className="player-range"
        max={Math.max(duration, 1)}
        min="0"
        step="0.1"
        type="range"
        value={Math.min(currentTime, duration || 0)}
        onChange={(event) => seek(Number(event.target.value))}
        style={{ '--player-progress': `${duration ? (currentTime / duration) * 100 : 0}%` } as React.CSSProperties}
      />
      <span className="player-time player-time-total">{formatDuration(duration, duration >= 3600)}</span>
      <select
        aria-label="Velocidad de reproducción"
        className="rate-select"
        value={playbackRate}
        onChange={(event) => changeRate(Number(event.target.value))}
      >
        {[0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => (
          <option key={rate} value={rate}>{rate}×</option>
        ))}
      </select>
    </div>
  );
}
