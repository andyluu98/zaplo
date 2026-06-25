import { parsePhotoId } from '../services/facebook/write/facebook-photo-upload';

test('parsePhotoId lấy photoID từ payload (object hoặc string)', () => {
  const obj = { __ar: 1, payload: { photoID: '122100011205368888', width: 1, height: 1 } };
  expect(parsePhotoId(obj)).toBe('122100011205368888');
  expect(parsePhotoId(JSON.stringify(obj))).toBe('122100011205368888');
  expect(parsePhotoId('for (;;);' + JSON.stringify(obj))).toBe('122100011205368888');
});

test('parsePhotoId trả rỗng khi không có / lỗi', () => {
  expect(parsePhotoId({ error: 1366046, errorSummary: 'x' })).toBe('');
  expect(parsePhotoId('')).toBe('');
  expect(parsePhotoId('not json')).toBe('');
});
