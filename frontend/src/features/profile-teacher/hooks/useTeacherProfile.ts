import { useEffect, useState } from 'react';
import { getTeacherProfile, subscribeTeacherProfile, type TeacherProfile } from '../services/teacherProfileService';

export function useTeacherProfile() {
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let updated = false;
    const unsubscribe = subscribeTeacherProfile(next => {
      updated = true;
      setProfile(next);
      setError('');
    });
    void getTeacherProfile().then(next => {
      if (active && !updated) setProfile(next);
    }).catch(() => {
      if (active && !updated) setError('Không tải được hồ sơ. Vui lòng thử lại.');
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  return { profile, error };
}
