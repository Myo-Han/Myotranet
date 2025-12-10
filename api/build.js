// api/build.js  (Vercel 서버리스 함수)

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      return res.json({ message: 'POST 메서드만 허용됩니다.' });
    }

    const body = req.body || {};
    const password = (body.password ?? '').toString().trim();

    if (!password) {
      res.statusCode = 400;
      return res.json({ message: '비밀번호가 필요합니다.' });
    }

    // 집 노트북 server.cjs 로 그대로 포워딩
    const homeApiUrl = 'http://119.204.228.231:15565/api/build';

    const forwardRes = await fetch(homeApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    const text = await forwardRes.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text || '알 수 없는 응답' };
    }

    res.statusCode = forwardRes.status;
    return res.json(data);
  } catch (err) {
    console.error('Vercel /api/build 에러:', err);
    res.statusCode = 500;
    return res.json({ message: '빌드 API 중간 포워딩 오류' });
  }
}
