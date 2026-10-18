export const checkIds = [
  'native-reticulum-room-created', 'both-renderers-load-retained-f03-export',
  'two-distinct-reticulum-sessions-and-mutual-presence', 'real-dialog-audio-transports-and-packets',
  'alpha-keyboard-pose-reaches-beta', 'beta-keyboard-pose-reaches-alpha',
  'closed-client-leaves-native-presence', 'same-browser-rejoin-restores-native-pose-flow',
  'no-late-browser-or-cleanup-errors',
];

const httpOrigins = new Set(['https://hubs.local:4000', 'https://hubs.local:8080',
  'https://hubs-assets.local:4000', 'https://hubs-proxy.local:4000']);
const socketOrigins = new Set(['wss://hubs.local:4000', 'wss://hubs.local:8080', 'wss://hubs.local:4443']);
export function allowedRequest(value, websocket = false) {
  try {
    const url = new URL(value);
    return !url.username && !url.password && (websocket ? socketOrigins : httpOrigins).has(url.origin);
  } catch { return false; }
}

export function finalStatus(report) {
  return report.fatal === null && report.cleanupSettled === true &&
    ['errors', 'failedRequests', 'blockedRequests', 'cleanupErrors'].every(key => Array.isArray(report[key]) && report[key].length === 0) &&
    report.checks.length === checkIds.length &&
    report.checks.every((check, i) => check.id === checkIds[i] && check.status === 'passed') ? 'passed' : 'failed';
}
