import { supabase } from '../../lib/supabase'
import { InternetMessagingService } from './InternetMessagingService'

let singleton: InternetMessagingService | null = null

export function getInternetMessagingService(): InternetMessagingService | null {
  if (!supabase) return null
  singleton ??= new InternetMessagingService(supabase)
  return singleton
}
