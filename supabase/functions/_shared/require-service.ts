import { createHash, timingSafeEqual } from 'node:crypto'

export function requireService(req: Request, keys: (string | undefined)[]): boolean {
  const bearer = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
  const apikey = req.headers.get('apikey') ?? ''
  return keys.some(key => key && [bearer, apikey].some(candidate =>
    timingSafeEqual(createHash('sha256').update(candidate).digest(), createHash('sha256').update(key).digest())))
}
