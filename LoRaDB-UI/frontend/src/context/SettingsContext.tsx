import React, { createContext, useContext, useState, ReactNode } from 'react';

interface SettingsContextType {
  showDebugView: boolean;
  setShowDebugView: (show: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [showDebugView, setShowDebugViewState] = useState<boolean>(() => {
    const saved = localStorage.getItem('settings_showDebugView');
    return saved !== null ? JSON.parse(saved) : false;
  });

  const setShowDebugView = (show: boolean) => {
    setShowDebugViewState(show);
    localStorage.setItem('settings_showDebugView', JSON.stringify(show));
  };

  return (
    <SettingsContext.Provider value={{ showDebugView, setShowDebugView }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
