import playSound from 'play-sound';

export const play = (file: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const player = playSound({});
    player.play(file, { mplayer: ['-volume', 100] }, (error: any) => {
      if (error) {
        console.error('Error playing sound:', error);
        reject(error);
      } else {
        console.log('Sound is playing...');
        resolve();
      }
    });
  });
}