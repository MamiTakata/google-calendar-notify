const LINE_URL = 'https://notify-api.line.me/api/notify';
const WEEK_LIST = new Array('日', '月', '火', '水', '木', '金', '土');
const TIME_ZONE = 'Asia/Tokyo';


function onUpdateCalendar(e) {  
  console.log('カレンダー変更がありました。');
  syncEventsLineNotify(e.calendarId,false);
  console.log('カレンダー変更通知が完了しました。');
}

/**
 * 指定されたカレンダーから変更されたイベントを取得してLINE通知を行う。
 * 同期トークンが見つからないか無効な場合は、フル同期を実行。現在日時以降のイベントを取得してログに記録。LINE通知は行わない。
 *
 * @param {string} calendarId イベントを取得するカレンダーの ID。
 * @param {boolean} fullSync true の場合、既存の同期トークンを破棄し、フル同期を実行します。
 *                           false の場合、可能であれば既存の同期トークンを使用します。
 */
function syncEventsLineNotify(calendarId, fullSync) {
  const properties = PropertiesService.getUserProperties();
  const options = {
    maxResults: 100
  };
  const syncToken = properties.getProperty('syncToken');
  if (syncToken && !fullSync) {
    options.syncToken = syncToken;
  } else {
    options.timeMin = new Date().toISOString();
  }
  
  // 最低1回実行し、pageTokenがある限り繰り返す
  let events;
  let pageToken;

  do {
    // 予定一覧を取得（フル同期の場合はこの時間以降・差分同期の場合は更新された予定のみ）
    try {
      options.pageToken = pageToken;
      events = Calendar.Events.list(calendarId, options);
    } catch (e) {
      // 同期トークンが見つからないか無効な場合、フル同期にする
      if (e.message === 'Sync token is no longer valid, a full sync is required.') {
        properties.deleteProperty('syncToken');
        logSyncedEvents(calendarId, true);
        return;
      } else {
        throw new Error(e.message);
      }
    }

    // これ以降のイベントがない場合
    if (events.items && events.items.length === 0) {
      console.error('新規予定が見つかりませんでした。全て同期済みです。');
      return;
    }
    let calendar = CalendarApp.getCalendarById(calendarId);
    console.log('取得イベント件数 %s ', events.items.length);
    let message =``;
    // 予定ごとに処理
    for (const event of events.items) {

      let e = calendar.getEventById(event.id);
      let title = e.getTitle();
      let startTime = e.getStartTime();
      let endTime = e.getEndTime();

      let startDate = e.getStartTime(); startDate.setHours(0,0,0,0);
      let endDate = e.getEndTime(); endDate.setHours(0,0,0,0);

      let startFormatDate = Utilities.formatDate(startTime, TIME_ZONE, 'M月d日') + '(' + WEEK_LIST[startTime.getDay()] + ')';
      let endFormatDate = Utilities.formatDate(endTime, TIME_ZONE, 'M月d日') + '(' + WEEK_LIST[endTime.getDay()] + ')';

      let startFormatTime = Utilities.formatDate(startTime, TIME_ZONE, 'H:mm');
      let endFormatTime = Utilities.formatDate(endTime, TIME_ZONE, 'H:mm');

      if(e.isAllDayEvent()){
        strTime = startFormatDate + ' 終日';
      }else{
        const today = new Date();  today.setHours(0,0,0,0);
        if(startDate.getTime() === endDate.getTime()){
          strTime = startFormatDate + startFormatTime + ' - ' + endFormatTime;
        }else{
          strTime = startFormatDate + startFormatTime + ' - ' + endFormatDate + endFormatTime;
        }
      }

      if (event.status === 'cancelled') {    
        message =`スケジュール削除\n - ${title}\n - ${strTime}`;
      } else {
        // 作成日時と更新日時の1970年1月1日00:00:00からの経過ミリ秒を取得
        let createdTime = new Date(event.created).getTime();
        let updatedTime = new Date(event.updated).getTime();

        // 更新日時と作成日時が10秒以上の場合は、更新扱いにする
        if(updatedTime - createdTime > 10000){
          message =`スケジュール更新\n - ${title}\n - ${strTime}`;
        } else {
          message =`スケジュール追加\n - ${title}\n - ${strTime}`;
        }
      }
      console.log(message);
      if (!fullSync) {
        lineNotify(`\n` + message);
      }
    }
    pageToken = events.nextPageToken;
  } while (pageToken);

  // 次回の差分同期用にトークンをプロパティに保存
  properties.setProperty('syncToken', events.nextSyncToken);
  console.log('次回の差分同期用にトークンをプロパティに保存しました。');
}

/**
 * LINE通知を行う。
 *
 * @param {string} message 通知メッセージ
 */
function lineNotify(message) {

  const token = PropertiesService.getScriptProperties().getProperty('LINE_API_TOKEN');

  const options = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    payload: {
      message: message,
    },
  }

  try {
    const res = UrlFetchApp.fetch(LINE_URL, options);
  } catch(e) {
    console.error('LINE通知に失敗しました。');
    console.error(e.message);
  }
}