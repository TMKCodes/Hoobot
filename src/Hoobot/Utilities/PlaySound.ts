import playSound from "play-sound";

export const play = async (file: string) => {
  if (process.env.PLAY_AUDIO === "false") return;

  const player = playSound({});
  player.play(file, { mplayer: ["-volume", 100] }, () => {});
};
