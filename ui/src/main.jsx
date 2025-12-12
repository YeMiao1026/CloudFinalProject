import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import DeadliftCoachApp from './DeadliftCoachApp.jsx';
import LandingPage from './LandingPage.jsx';

const Main = () => {
  const [showApp, setShowApp] = useState(false);

  return (
    <React.StrictMode>
      {showApp ? (
        <DeadliftCoachApp onBack={() => setShowApp(false)} />
      ) : (
        <LandingPage onStart={() => setShowApp(true)} />
      )}
    </React.StrictMode>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<Main />);
