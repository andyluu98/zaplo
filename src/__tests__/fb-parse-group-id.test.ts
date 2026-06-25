import { parseGroupId } from '../services/facebook/write/parse-group-id';

test('lấy id số từ link/id, vanity slug → rỗng', () => {
  expect(parseGroupId('https://www.facebook.com/groups/1870942289894981')).toBe('1870942289894981');
  expect(parseGroupId('https://www.facebook.com/groups/1870942289894981/')).toBe('1870942289894981');
  expect(parseGroupId('1870942289894981')).toBe('1870942289894981');
  expect(parseGroupId('https://facebook.com/groups/my-vanity-slug')).toBe('');
  expect(parseGroupId('  ')).toBe('');
});
