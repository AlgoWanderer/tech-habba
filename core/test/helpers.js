import { scan } from '../index.js';

export const scanOne = (content, path = 'app.js') => scan([{ path, content }]);
export const rules = (content, ruleId, path) => scanOne(content, path).filter((f) => f.ruleId === ruleId);
