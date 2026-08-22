import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { HomeScreen, type EnterTarget } from './src/screens/HomeScreen';
import { WebScreen } from './src/screens/WebScreen';

export default function App() {
  const [target, setTarget] = useState<EnterTarget | null>(null);

  if (target) {
    return (
      <>
        <StatusBar style="light" />
        <WebScreen target={target} onBack={() => setTarget(null)} />
      </>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <HomeScreen onEnter={setTarget} />
    </>
  );
}