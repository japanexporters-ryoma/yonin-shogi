import type { FirebaseOptions } from 'firebase/app';

// Firebase コンソールの「プロジェクトの設定 → マイアプリ」に表示される値。
// この値はブラウザに配られる公開情報で、秘密の鍵ではない（書き込みの制限は database.rules.json で行う）。
export const firebaseConfig: FirebaseOptions | null = {
  apiKey: 'AIzaSyCsov_vMvi9l9mQXsG2F5PE5ee6_AO-ynA',
  authDomain: 'yonin-shogi.firebaseapp.com',
  databaseURL: 'https://yonin-shogi-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'yonin-shogi',
  storageBucket: 'yonin-shogi.firebasestorage.app',
  messagingSenderId: '903088911752',
  appId: '1:903088911752:web:700c55967dbbaba65db63d',
};
