import {useSyncExternalStore} from 'react';
import {getAiQuota} from '@shared/features/ai-generator/services/aiCreditsService';
import {createQuotaStore} from './quotaStore';
const store=createQuotaStore(getAiQuota);
export function useAiQuota() {
 const snapshot=useSyncExternalStore(store.subscribe,store.getSnapshot);
 return {...snapshot,refresh:store.refresh};
}
