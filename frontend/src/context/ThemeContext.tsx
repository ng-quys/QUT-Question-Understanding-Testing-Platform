import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeId = 'theme-1' | 'theme-2' | 'theme-3';

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  subtitle: string;
  tag: string;
  bgMain: string;
  bgCard: string;
  textColor: string;
  bannerGradient: string;
  primaryColor: string;
  accentColor: string;
  accentBadge: string;
}

export const THEMES: ThemeConfig[] = [
  {
    id: 'theme-1',
    name: 'Tri thức & Tin cậy',
    subtitle: 'Mặc định • Navy & Vàng kim',
    tag: 'Classic Navy',
    bgMain: '#F5F7FA',
    bgCard: '#FFFFFF',
    textColor: '#0D1B2A',
    bannerGradient: 'from-[#0D1B2A] to-[#1E3A8A]',
    primaryColor: '#1E3A8A',
    accentColor: '#F4C430',
    accentBadge: 'bg-[#F4C430]/20 text-[#854D0E] border-[#F4C430]/40',
  },
  {
    id: 'theme-2',
    name: 'Xanh Bầu Trời Tươi Sáng',
    subtitle: 'Soft Sky Blue • #0EA5E9 & #F4C430',
    tag: 'Soft Sky Blue',
    bgMain: '#F0F9FF',
    bgCard: '#FFFFFF',
    textColor: '#1E293B',
    bannerGradient: 'from-[#0EA5E9] to-[#BAE6FD]',
    primaryColor: '#0EA5E9',
    accentColor: '#F4C430',
    accentBadge: 'bg-[#F4C430]/20 text-[#854D0E] border-[#F4C430]/40',
  },
  {
    id: 'theme-3',
    name: 'Sang trọng & Cao cấp',
    subtitle: 'Charcoal & Xanh Classic & Bạc',
    tag: 'Charcoal & Silver',
    bgMain: '#F1F1F1',
    bgCard: '#FAFAF8',
    textColor: '#1F2937',
    bannerGradient: 'from-[#1F2937] to-[#374151]',
    primaryColor: '#2563EB',
    accentColor: '#C0C0C0',
    accentBadge: 'bg-[#C0C0C0]/30 text-[#374151] border-[#C0C0C0]',
  },
];

interface ThemeContextType {
  currentTheme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  activeConfig: ThemeConfig;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'examflow_theme';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTheme, setCurrentThemeState] = useState<ThemeId>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'theme-1' || saved === 'theme-2' || saved === 'theme-3') {
        return saved;
      }
    } catch {
      // localStorage may be unavailable
    }
    return 'theme-1';
  });

  const applyThemeToDOM = (theme: ThemeId) => {
    const body = document.body;
    body.classList.remove('theme-1', 'theme-2', 'theme-3');
    body.classList.add(theme);
  };

  const setTheme = (theme: ThemeId) => {
    setCurrentThemeState(theme);
    applyThemeToDOM(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    applyThemeToDOM(currentTheme);
  }, [currentTheme]);

  const activeConfig = THEMES.find((t) => t.id === currentTheme) || THEMES[0];

  return (
    <ThemeContext.Provider value={{ currentTheme, setTheme, activeConfig }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
