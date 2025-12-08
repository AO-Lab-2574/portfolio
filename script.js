// スプレッドシートの元のID
const ORIGINAL_SPREADSHEET_ID = '1iwP323oeDeCseDJpslj07ulrQT77lSF6';

// スプレッドシートの公開ID（「ウェブに公開」で取得したID）
// 公開後に取得したIDに置き換えてください
const PUBLIC_SPREADSHEET_ID = '2PACX-1vSp9rwwRm7ecv2VH75gmK5A2WMEjt92Mg4bUQj94_4jJa1pIottYecfSZWhww6Gzw';

const SHEET_ID = '228151703'; // 技術者履歴シートのID

// 表示する項番の範囲を指定（nullの場合は全て表示）
const DISPLAY_START = null; // 開始項番（例: 1）
const DISPLAY_END = null;   // 終了項番（例: 2）

// Google Sheets APIのエンドポイント（公開スプレッドシート用）
const API_URL = `https://docs.google.com/spreadsheets/d/e/${PUBLIC_SPREADSHEET_ID}/pub?output=csv&gid=${SHEET_ID}`;

/**
 * プロジェクトデータを読み込む
 */
async function loadProjects() {
    try {
        console.log('スプレッドシートを読み込み中...', API_URL);

        const response = await fetch(API_URL);

        if (!response.ok) {
            throw new Error(`HTTP エラー: ${response.status}`);
        }

        const csvText = await response.text();
        console.log('CSV取得成功。データ長:', csvText.length);
        console.log('CSVの最初の500文字:', csvText.substring(0, 500));

        // CSVをパース
        const projects = parseCSV(csvText);
        console.log('パース完了。プロジェクト数:', projects.length);

        // 項番でフィルタリング
        const filteredProjects = filterByKouban(projects);
        console.log('フィルタリング後のプロジェクト数:', filteredProjects.length);

        // プロジェクトを表示
        displayProjects(filteredProjects);

        // ローディング表示を非表示
        document.getElementById('loading').style.display = 'none';
    } catch (error) {
        console.error('データの読み込みエラー:', error);
        document.getElementById('loading').innerHTML = `
            <p style="color: red;">データの読み込みに失敗しました。</p>
            <p style="color: #666; font-size: 14px; margin-top: 10px;">
                <strong>以下を確認してください：</strong><br>
                1. スプレッドシートが「ウェブに公開」されているか<br>
                2. 正しいシート（技術者履歴）を読み込んでいるか<br>
                3. ブラウザのコンソール（F12）でエラー詳細を確認<br><br>
                エラー詳細: ${error.message}
            </p>
        `;
    }
}

/**
 * CSVテキストをパースしてオブジェクト配列に変換
 */
function parseCSV(csv) {
    const lines = csv.split('\n').filter(line => line.trim());

    if (lines.length === 0) {
        console.error('CSVデータが空です');
        return [];
    }

    // ヘッダー行を探す（「作業期間」を含む行）
    let headerIndex = -1;
    let headers = [];

    for (let i = 0; i < Math.min(lines.length, 30); i++) {
        const testHeaders = parseCSVLine(lines[i]);

        // デバッグ: 各行の最初の10列を表示
        if (i < 25) {
            console.log(`${i}行目:`, testHeaders.slice(0, 10).map(h => h ? h.substring(0, 20) : '(空)'));
        }

        // 「作業期間」を含む行をヘッダーとみなす
        const hasWorkPeriod = testHeaders.some(h => h && h.includes('作業期間'));
        const hasIndustry = testHeaders.some(h => h && h.includes('業種'));
        const hasProjectName = testHeaders.some(h => h && (h.includes('プロジェクト名') || h.includes('案件名')));

        if (hasWorkPeriod || (hasIndustry && hasProjectName)) {
            headerIndex = i;
            headers = testHeaders;
            console.log(`✓ ヘッダー行を発見: ${i}行目（Excel行: ${i + 1}）`, headers.filter(h => h));
            break;
        }
    }

    if (headerIndex === -1) {
        console.error('❌ ヘッダー行が見つかりませんでした');
        console.log('💡 先頭30行を確認してください');
        return [];
    }

    const projects = [];

    // ヘッダーの次の行からデータを読み込む
    let projectCount = 0;
    for (let i = headerIndex + 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);

        // 空行をスキップ
        if (values.every(v => !v || !v.trim())) {
            continue;
        }

        const project = {};

        headers.forEach((header, index) => {
            if (header) { // ヘッダーが空でない場合のみ
                project[header] = values[index] || '';
            }
        });

        // プロジェクト名、作業内容、業種のいずれかがある行を追加
        const projectName = project['プロジェクト名'] || project['案件名'] || project['PJ名'] || '';
        const workContent = project['作業内容'] || '';
        const industry = project['業種・業態'] || project['業種'] || '';
        const period = project['作業期間'] || project['期間'] || '';

        // データがある行のみ追加
        if (projectName.trim() || workContent.trim() || (industry.trim() && period.trim())) {
            projectCount++;
            project['_行番号'] = i + 1; // Excel行番号
            project['_データ番号'] = projectCount;
            projects.push(project);
            console.log(`✓ プロジェクト${projectCount}を追加 (Excel ${i + 1}行目):`, projectName || '(名前なし)', '業種:', industry.substring(0, 20));
        }
    }

    console.log(`📊 合計 ${projectCount} 件のプロジェクトデータを読み込みました`);
    return projects;
}

/**
 * CSV行をパース（カンマ区切りだが、ダブルクォート内のカンマは無視）
 */
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }

    result.push(current.trim());
    return result;
}

/**
 * 項番で絞り込み
 */
function filterByKouban(projects) {
    if (DISPLAY_START === null && DISPLAY_END === null) {
        return projects; // 全て表示
    }

    return projects.filter((project, index) => {
        // データ番号で絞り込み
        const dataNumber = project['_データ番号'] || (index + 1);

        const matchStart = DISPLAY_START === null || dataNumber >= DISPLAY_START;
        const matchEnd = DISPLAY_END === null || dataNumber <= DISPLAY_END;

        const matched = matchStart && matchEnd;

        if (DISPLAY_START !== null || DISPLAY_END !== null) {
            console.log(`データ${dataNumber}: ${matched ? '✓表示' : '×非表示'}`);
        }

        return matched;
    });
}

/**
 * プロジェクトをHTML表示
 */
function displayProjects(projects) {
    const container = document.getElementById('projects-container');
    container.innerHTML = '';

    if (projects.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">表示するプロジェクトデータがありません。</p>';
        return;
    }

    projects.forEach((project, index) => {
        const projectDiv = document.createElement('div');
        projectDiv.className = 'project';

        // 各フィールドを取得（複数の列名パターンに対応）
        const projectName = project['プロジェクト名'] || project['案件名'] || project['PJ名'] || '案件名なし';
        const period = project['作業期間'] || project['期間'] || '期間未定';
        const industry = project['業種・業態'] || project['業種'] || '-';
        const memberCount = project['人数'] || '-';
        const role = project['担当分野PM／PL ESE／SE PG'] || project['担当分野'] || project['役割'] || '-';

        // 使用技術（複数の列をまとめる）
        const techFields = [
            project['開発言語・ツール・データベース'] || '',
            project['機種OS名'] || '',
            project['使用技術'] || ''
        ].filter(t => t.trim());

        const techArray = techFields.join(',')
            .split(/[、,，\n]/)
            .map(t => t.trim())
            .filter(t => t && t !== '-');

        // 作業内容
        const workContent = project['作業内容'] || '';
        const workItems = workContent
            .split(/\n/)
            .map(item => item.trim())
            .filter(item => item && item !== '-');

        projectDiv.innerHTML = `
            <h3>${escapeHtml(projectName)}</h3>
            <div class="project-meta">
                <span>📋 No: ${project['_データ番号'] || (index + 1)}</span>
                <span>📅 ${escapeHtml(period)}</span>
                ${memberCount !== '-' ? `<span>👥 ${escapeHtml(memberCount)}人</span>` : ''}
                <span>🏢 ${escapeHtml(industry)}</span>
                ${role !== '-' ? `<span>💼 ${escapeHtml(role)}</span>` : ''}
            </div>

            ${techArray.length > 0 ? `
                <h4 style="color: #667eea; margin-top: 20px; margin-bottom: 10px;">使用技術</h4>
                <div class="tech-stack">
                    ${techArray.map(tech => `<span class="tech-badge">${escapeHtml(tech)}</span>`).join('')}
                </div>
            ` : ''}

            ${workItems.length > 0 ? `
                <h4 style="color: #667eea; margin-top: 20px; margin-bottom: 10px;">作業内容</h4>
                <ul>
                    ${workItems.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
                </ul>
            ` : ''}
        `;

        container.appendChild(projectDiv);
    });
}

/**
 * HTMLエスケープ処理
 */
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text ? String(text).replace(/[&<>"']/g, m => map[m]) : '';
}

// ページ読み込み時にデータを取得
window.addEventListener('DOMContentLoaded', loadProjects);