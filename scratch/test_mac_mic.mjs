import { app, systemPreferences } from 'electron';

app.whenReady().then(async () => {
  console.log('PLATFORM:', process.platform);
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('microphone');
    console.log('MIC ACCESS STATUS:', status);
    if (status !== 'granted') {
      console.log('Requesting mic access...');
      const granted = await systemPreferences.askForMediaAccess('microphone');
      console.log('ASK RESULT:', granted);
    }
  }
  app.quit();
});
