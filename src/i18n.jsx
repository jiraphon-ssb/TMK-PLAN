/* ============================================================
   TMK Operation — Multi-language (TH/EN)
   ============================================================ */
import { createContext, useContext, useState, useCallback } from 'react';

const LangContext = createContext();

const T = {
  th: {
    // ---- Common ----
    cancel: 'ยกเลิก', save: 'บันทึก', edit: 'แก้ไข', delete: 'ลบ', add: 'เพิ่ม',
    search: 'ค้นหา', all: 'ทั้งหมด', close: 'ปิด', confirm: 'ยืนยัน', back: 'กลับ',
    loading: 'กำลังโหลด...', saving: 'กำลังบันทึก...', saved: 'บันทึกแล้ว',
    viewAll: 'ดูทั้งหมด', today: 'วันนี้', month: 'เดือน', year: 'ปี',
    status: 'สถานะ', channel: 'ช่องทาง', campaign: 'แคมเปญ', team: 'ทีม',
    revenue: 'รายได้', orders: 'ออเดอร์', target: 'เป้าหมาย', actual: 'จริง',
    task: 'งาน', tasks: 'งาน', product: 'สินค้า', customer: 'ลูกค้า',
    newCust: 'ลูกค้าใหม่', oldCust: 'ลูกค้าเก่า', person: 'คน', piece: 'ตัว',
    day: 'วัน', days: 'วัน', minute: 'นาที', hour: 'ชม.', ago: 'ที่แล้ว',
    yesterday: 'เมื่อวาน', export: 'Export', unsavedTitle: 'ยังไม่ได้บันทึก',
    unsavedMsg: 'คุณมีข้อมูลที่ยังไม่ได้บันทึก ต้องการปิดหรือไม่?',
    discardClose: 'ปิดโดยไม่บันทึก', goBack: 'กลับไปแก้ไข',

    // ---- Nav ----
    navHome: 'หน้าหลัก', navSales: 'ยอดขาย', navPlanner: 'วางแผน', navFlows: 'โครงการ',
    navCatalog: 'ยอดขาย', navSystem: 'ตั้งค่า', navLogs: 'บันทึกกิจกรรม', subFlowBoard: 'โครงการทั้งหมด', subFlowList: 'รายการงาน', subFlowHistory: 'ประวัติกิจกรรม', subMyTasks: 'งานของฉัน',
    subOverview: 'ภาพรวมยอดขาย', subChannels: 'ช่องทางการขาย',
    subAds: 'โฆษณา & แชท', subCustomers: 'ลูกค้า',
    subDaily: 'บันทึกรายวัน', subMonthly: 'บันทึก & ภาพรวมเดือน', subStatus: 'สถานะการกรอก', subDataHub: 'ส่งยอด & ข้อมูล',
    subCalendar: 'ปฏิทินปฏิบัติงาน', subKanban: 'บอร์ดคุมงาน', subTimeline: 'ไทม์ไลน์แคมเปญ',
    subCampaigns: 'แคมเปญ', subReport: 'รายงานขาย', subPerf: 'ประสิทธิภาพเซลล์', subOrders: 'ออเดอร์', subEntry: 'บันทึกขาย', subShirts: 'สินค้า', subStock: 'สต็อก', subCrm: 'ภาพรวม CRM', subHealth: 'สุขภาพข้อมูล', subImport: 'ข้อมูล', subCustomers2: 'ลูกค้า', subShopCust: 'ลูกค้าร้าน', subAudit: 'ประวัติการใช้งาน', subRoles: 'สิทธิ์ผู้ใช้', subTrash: 'ถังขยะ',
    panelSalesSub: 'ดูตัวเลข บันทึกยอด และตั้งค่า',
    panelPlannerSub: 'งาน แคมเปญ และปฏิทินทีม',
    panelCatalogSub: 'สินค้า แคมเปญ และการผลิต',
    panelSystemSub: 'ตั้งค่าระบบและจัดการสิทธิ์',

    // ---- Home ----
    homeOverview: 'ภาพรวมวันนี้',
    greetMorning: 'สวัสดีตอนเช้า', greetAfternoon: 'สวัสดีตอนบ่าย',
    greetEvening: 'สวัสดีตอนเย็น', greetNight: 'สวัสดีตอนดึก',
    synced: 'ซิงค์แล้ว', mtdTitle: 'ยอดขายรวมเดือนนี้',
    monthTarget: 'เป้าเดือน', runRate: 'คาดสิ้นเดือน', remaining: 'ขาดอีก',
    watchOut: 'ต้องจับตา', focusToday: 'โฟกัสวันนี้', recentActivity: 'ความเคลื่อนไหวล่าสุด',
    channelSales: 'ช่องทางการขาย', dailySalesMonth: 'ยอดขายรายวันเดือนนี้',
    openSalesDash: 'เปิด Sales Dashboard',
    totalDays: 'รวม {0} วัน', avgPerDay: 'เฉลี่ย {0}/วัน', aboveAvg: 'สูงกว่าค่าเฉลี่ย',
    ordersTotal: 'ออเดอร์รวม', aov: 'มูลค่าต่อบิล (AOV)',
    adCost: 'ค่าแอด / ACOS', newCustCount: 'ลูกค้าใหม่',
    vsLastMonth: 'vs เดือนก่อน', goodTrend: 'ดีต่อเนื่อง',
    ceiling: 'เพดาน', ofRevenue: 'ของรายได้',
    paceOnTrack: 'ทันเป้า', paceSlow: 'ตามเป้าช้า', paceOff: 'หลุดเป้า',
    mustAvg: 'ต้องทำเฉลี่ย {0}/วัน อีก {1} วัน',
    acosOver: 'ACOS รวม {0} เกินเพดาน',
    fbAcosHigh: 'Facebook ACOS {0} สูงสุด — ทบทวนงบ',
    stockAlert: 'สินค้าใกล้/หมดสต็อก {0} รายการ',

    // ---- Sales ----
    salesMTD: 'ยอดขาย MTD', dayOf: 'วันที่', ofTarget: 'ของเป้า',
    setTarget: 'ตั้งเป้าหมาย', channelRevShare: 'สัดส่วนรายได้ตามช่องทาง',
    darkNew: 'เข้ม = ลูกค้าใหม่', lightOld: 'อ่อน = ลูกค้าเก่า',
    dailySales: 'ยอดขายรายวัน', last3m: '3 เดือนล่าสุด',
    yoy: 'เทียบปีก่อน', inclProjection: 'รวมคาดการณ์ (โปร่ง)',
    adBudget: 'งบโฆษณา', totalBudget: 'งบทั้งหมด', spent: 'ใช้ไปแล้ว',
    budgetRemain: 'คงเหลือ', burnRate: 'Burn rate/วัน', projSpend: 'คาดใช้',
    ofBudget: 'ของงบ', ofTime: 'ของเวลา',
    adPerformance: 'ประสิทธิภาพโฆษณา', adCampaigns: 'แคมเปญแอด',
    createAdCamp: 'สร้างแคมเปญแอด',
    adRunning: 'กำลังยิง', adWaiting: 'รอเริ่ม', adDone: 'จบแล้ว',
    fbDeepDive: 'เจาะลึก Facebook & แชท', avgReplyTime: 'เวลาตอบแชทเฉลี่ย',
    chatToOrder: 'แชท → สั่งซื้อ', chat: 'แชท', costPer: 'ต้นทุน',
    perChat: 'ต่อแชท', perOrder: 'ต่อออเดอร์',
    msgVolume: 'ปริมาณข้อความ',
    custSegments: 'กลุ่มลูกค้า', updateSegments: 'อัปเดตกลุ่มลูกค้า',
    clv: 'Customer Lifetime Value (CLV)', avgPerCust: 'เฉลี่ยต่อลูกค้า',
    histData: 'ข้อมูลย้อนหลัง 6 เดือน', returningShare: 'สัดส่วนลูกค้าเก่า (Returning)',
    returningGoal: 'เป้าหมาย: เพิ่ม Returning ≥ 35% ภายในสิ้นเดือน',
    cohortRetention: 'ตาราง Cohort Retention', startMonth: 'เดือนเริ่มต้น',
    monthN: 'เดือนที่ {0}', newVsOldByChannel: 'ลูกค้าใหม่ vs เก่า แยกตามช่องทาง',
    new: 'ใหม่', old: 'เก่า', growth: 'เติบโต',

    // ---- Planner ----
    active: 'กำลังทำ', done: 'เสร็จแล้ว', searchTask: 'ค้นหางาน...',
    statusTodo: 'รอดำเนินการ', statusInprogress: 'กำลังทำ',
    statusReview: 'รอตรวจ', statusDone: 'เสร็จแล้ว',
    statusTodoShort: 'รอ', statusInprogressShort: 'กำลังทำ',
    statusReviewShort: 'รอตรวจ', statusDoneShort: 'เสร็จ',
    addTask: 'เพิ่ม', noTasksDay: 'ไม่มีงานในวันนี้',
    prevMonth: 'เดือนก่อน', nextMonth: 'เดือนถัดไป',
    moreTask: '+{0} งาน', dragHere: 'ลากการ์ดมาที่นี่',
    overdue: 'เกินกำหนด',
    responsible: 'ผู้รับผิดชอบ', campProgress: 'ความคืบหน้าแคมเปญ',
    campLive: 'Live', campPrepare: 'เตรียม', campDone: 'จบ',

    // ---- Catalog ----
    topProducts: 'สินค้าขายดี', addProduct: 'เพิ่มสินค้า',
    price: 'ราคา', sold: 'ขายแล้ว', stock: 'คงเหลือ',
    topColors: 'สีขายดี', topSizes: 'ไซส์ขายดี',
    stockOk: 'ปกติ', stockLow: 'ใกล้หมด', stockOut: 'หมดสต็อก',
    campaigns_n: '{0} แคมเปญ', campUpcoming: 'กำลังจะมา',
    campInProgress: 'กำลังดำเนินการ', campCompleted: 'จบแล้ว',
    createCampaign: 'สร้างแคมเปญ',
    poTitle: 'ใบสั่งผลิต & PO โรงงาน', openPO: 'เปิด PO ใหม่',
    quantity: 'จำนวน', orderDate: 'วันที่สั่ง', arrivalDate: 'กำหนดเข้า',
    producing: 'กำลังผลิต', arrived: 'ของเข้าแล้ว',
    openPOAction: 'เปิด PO',

    // ---- System ----
    auditTitle: 'ประวัติการใช้งาน', auditCreate: 'สร้าง',
    auditUpdate: 'แก้ไข', auditDelete: 'ลบ',
    rolesTitle: 'สิทธิ์ผู้ใช้', roleAdmin: 'ผู้ดูแลระบบ',
    roleEditor: 'แก้ไขได้', roleViewer: 'ดูอย่างเดียว',
    addRole: 'เพิ่ม / แก้สิทธิ์', saveRole: 'บันทึกสิทธิ์',
    roleDesc: 'ผู้ดูแลจัดการได้ทุกอย่าง · แก้ไขได้บันทึกข้อมูลงานและยอดขาย · ดูอย่างเดียวเปิดดูได้แต่แก้ไม่ได้',
    trashTitle: 'ถังขยะว่างเปล่า',
    trashDesc: 'รายการที่ลบจะเก็บไว้ที่นี่ 30 วัน ก่อนลบถาวร · กู้คืนได้ตลอด',

    // ---- Entry ----
    currentMonth: 'เดือนปัจจุบัน', pastMonth: 'เดือนที่ผ่านมา',
    futureMonth: 'เตรียมการ', viewQuarter: 'ดูรายไตรมาส', viewMonth: 'ดูรายเดือน',
    notEntered: 'ยังไม่ได้กรอกยอดวันนี้', entered: 'กรอกยอดวันนี้แล้ว',
    enterNow: 'กรอกเลย', recordSales: 'บันทึกยอดขายวันนี้',
    recordSalesDesc: 'กรอกยอดทุกช่องทาง — Shopee, TikTok, Lazada, Facebook, LINE, CRM',
    entryCalendar: 'ปฏิทินการกรอก', recent7: 'ยอดขาย 7 วันล่าสุด',
    enteredStatus: 'กรอกแล้ว', notEnteredStatus: 'ยังไม่กรอก',
    monthlySetup: 'ตั้งค่ารายเดือน', setupFor: 'ข้อมูลที่ต้องตั้งค่าสำหรับเดือน{0}',
    histEntry: 'ข้อมูลย้อนหลัง', histProgress: 'กรอกแล้ว {0}/{1} เดือน',
    closed: 'ปิดแล้ว', inProgress: 'กำลังดำเนินการ', preparing: 'เตรียมการ',
    setTargetAdvance: 'ตั้งเป้าล่วงหน้า', copyPrev: 'Copy จากเดือนก่อน',
    readOnly: 'ข้อมูลเดือนนี้ถูกปิดแล้ว สามารถดูข้อมูลย้อนหลังได้',
    actualVsTarget: 'ผลจริง vs เป้า', viewSummary: 'ดูสรุปผล',
    completionStatus: 'สถานะการกรอกข้อมูล', checklist: 'Checklist ข้อมูลที่ต้องกรอก',
    tips: 'เคล็ดลับ',
    tip1: 'กรอกยอดทุกวันก่อน 22:00 เพื่อให้ Dashboard อัปเดตทันเวลา',
    tip2: 'ตั้งเป้าเดือนใหม่ภายในวันที่ 1 ของเดือน',
    tip3: 'อัปเดตกลุ่มลูกค้าทุกเดือนเพื่อให้โปรโมชั่นตรงเป้า',

    // ---- Modals ----
    recordTitle: 'บันทึกยอดขายประจำวัน', recordSub: 'กรอกยอดแต่ละช่องทาง',
    step1: '1. กรอกข้อมูล', step2: '2. ตรวจสอบ & บันทึก',
    reviewBefore: 'ตรวจสอบก่อนบันทึก', confirmSave: 'ยืนยันบันทึก',
    goBackEdit: 'กลับแก้ไข', copyYesterday: 'คัดลอกเมื่อวาน',
    date: 'วันที่', salesAmount: 'ยอดขาย (฿)', adCostField: 'ค่าแอด (฿)',
    inquiry: 'แชท/สอบถาม', dailyNote: 'โน้ตประจำวัน',
    avgChatTime: 'เวลาตอบแชทเฉลี่ย (นาที)',
    todayTotal: 'ยอดรวมวันนี้', channelDetail: 'รายละเอียดต่อช่องทาง',
    mtdImpact: 'ผลกระทบต่อเป้าเดือน', mtdAfter: 'MTD หลังบันทึก',
    newRunRate: 'Run Rate ใหม่', overTarget: 'เกินเป้า',
    shortBy: 'ขาดอีก {0}', onTrack: 'ทันเป้า', mustHurry: 'ต้องเร่ง',
    thingsToKnow: 'สิ่งที่ควรรู้', note: 'โน้ต',
    aboveAvgPct: 'ยอดสูงกว่าค่าเฉลี่ย {0}%', belowAvgPct: 'ยอดต่ำกว่าค่าเฉลี่ย {0}%',
    acosTooHigh: 'ACOS {0}% สูงมาก', acosOverCeil: 'ACOS {0}% เกินเพดาน {1}%',
    acosGood: 'ACOS {0}% ดี', paceGood: 'Pace {0}% ทันเป้า', paceBad: 'Pace {0}% — ต้องเร่ง',

    taskTitle: 'หัวข้องาน', taskDetail: 'รายละเอียด', taskDate: 'วันที่',
    taskCampaign: 'แคมเปญ', taskResponsible: 'ผู้รับผิดชอบ', taskChannel: 'ช่องทาง',
    taskStatus: 'สถานะ', taskReminder: 'แจ้งเตือนล่วงหน้า',
    noReminder: 'ไม่เตือน', day1: '1 วัน', day3: '3 วัน', day7: '7 วัน',
    addTaskModal: 'เพิ่มงานใหม่', editTaskModal: 'แก้ไขงาน',
    taskSubtext: 'มอบหมายงานให้ทีมพร้อมกำหนดวัน',
    saveEdit: 'บันทึกการแก้ไข',

    addProductModal: 'เพิ่มสินค้า', editProductModal: 'แก้ไขสินค้า',
    productName: 'ชื่อสินค้า', sellPrice: 'ราคาขาย (฿)',
    targetQty: 'เป้าจำนวน (ตัว)', stockOnHand: 'สต็อกคงเหลือ',
    reorderPoint: 'จุดสั่งผลิตซ้ำ', soldQty: 'ขายไปแล้ว',
    strategy: 'กลยุทธ์ / โน้ต', saveProduct: 'บันทึกสินค้า',

    createCampModal: 'สร้างแคมเปญ', editCampModal: 'แก้ไขแคมเปญ',
    campName: 'ชื่อแคมเปญ', campColor: 'สีประจำแคมเปญ',
    campStart: 'เริ่ม', campEnd: 'สิ้นสุด', saveCampaign: 'บันทึกแคมเปญ',

    poModal: 'เปิด PO การผลิตใหม่', editPO: 'แก้ไข PO',
    poProduct: 'รายการสินค้า', poQty: 'จำนวน (ตัว)',
    poOrderDate: 'วันที่สั่ง', poArrivalDate: 'กำหนดของเข้า', savePO: 'บันทึก PO',

    monthlyTargetModal: 'ตั้งเป้าหมายรายเดือน', monthlyTargetSub: 'กำหนดเป้ายอดขายและงบโฆษณา',
    totalTarget: 'เป้ายอดรวม (฿)', perChannel: 'เป้าต่อช่อง',
    channelSum: 'รวมช่องทาง', matchTotal: 'ตรงกับเป้ารวม',
    diffTotal: 'ต่างจากเป้ารวม {0}', adBudgetTotal: 'งบแอดรวม (฿)',
    adPerChannel: 'งบแอดต่อช่อง', newCustTarget: 'เป้าลูกค้าใหม่',
    acosCeiling: 'เพดาน ACOS %',

    adCampModal: 'สร้างแคมเปญแอด', editAdCamp: 'แก้ไขแคมเปญแอด',
    platform: 'แพลตฟอร์ม', budget: 'งบประมาณ (฿)',
    startDate: 'วันเริ่ม', endDate: 'วันจบ', goal: 'เป้าหมาย',

    segmentModal: 'อัปเดตกลุ่มลูกค้า', segmentSub: 'จัดกลุ่มลูกค้าตามพฤติกรรมการซื้อ',
    segCount: 'จำนวน (คน)', segRevPct: '% รายได้',
    totalCust: 'ลูกค้ารวม', totalRevPct: 'รวม % รายได้',
    shouldBe100: 'ควรเป็น 100%',

    histModal: 'กรอกข้อมูลย้อนหลัง', histSub: 'ป้อนยอดขายรายเดือนเพื่อเปรียบเทียบแนวโน้ม',
    saveHist: 'บันทึกข้อมูลย้อนหลัง',

    // ---- Login ----
    loginTitle: 'เข้าสู่ระบบ TMK', loginWelcome: 'ยินดีต้อนรับกลับมา',
    email: 'อีเมล', password: 'รหัสผ่าน',
    agreeTerms: 'ยอมรับข้อตกลงและกฎระเบียบการใช้งานระบบ',
    signIn: 'เข้าสู่ระบบ (Sign In)', orSignWith: 'หรือลงชื่อเข้าใช้ผ่านช่องทางอื่น',
    googleSignIn: 'ลงชื่อเข้าใช้ด้วย Google Account',
    loginHero1: 'ศูนย์คุมยอดขาย', loginHero2: 'และทีมการตลาด', loginHero3: 'ในที่เดียว',
    loginDesc: 'ติดตามยอดทุกช่องทาง วางแผนแคมเปญ คุมงานทีม และดูสุขภาพธุรกิจแบบเรียลไทม์',
    loginStat1: 'เป้ายอดขาย/เดือน', loginStat2: 'ช่องทางการขาย', loginStat3: 'ซิงค์ทั้งทีม',

    // ---- Notifications ----
    notifications: 'การแจ้งเตือน',
    overdueBy: 'เลยกำหนด {0} วัน', dueToday: 'ครบกำหนดวันนี้', dueIn: 'อีก {0} วัน',

    // ---- Profile ----
    lightMode: 'โหมดสว่าง', darkMode: 'โหมดมืด', logout: 'ออกจากระบบ',
    campaignSettings: 'ตั้งค่าแคมเปญ', language: 'ภาษา',

    // ---- Spotlight ----
    spotlightPlaceholder: 'ค้นหางาน สินค้า แคมเปญ ทีม...',
    spotlightHint: 'พิมพ์เพื่อค้นหา',
    spotlightCategories: 'งาน · สินค้า · แคมเปญ · ทีม · ช่องทาง · นำทาง',
    noResults: 'ไม่พบผลลัพธ์สำหรับ "{0}"',
    catTask: 'งาน', catProduct: 'สินค้า', catCampaign: 'แคมเปญ',
    catTeam: 'ทีม', catChannel: 'ช่องทาง', catNav: 'นำทาง',
    goTo: 'ไปที่ {0}', select: 'เลือก', open: 'เปิด',

    // ---- Toast ----
    toastSaved: 'บันทึกข้อมูลเรียบร้อย', toastDeleted: 'ลบข้อมูลแล้ว',
    toastError: 'เกิดข้อผิดพลาด', toastCopied: 'คัดลอกข้อมูลเมื่อวานแล้ว',
    toastExported: 'ส่งออกข้อมูลเรียบร้อย',

    // ---- Onboarding ----
    onboardTitle: 'ยินดีต้อนรับสู่ TMK Operation',
    onboardSub: 'มาดูวิธีใช้งานระบบกันเลย',
    onboardStart: 'เริ่มเลย', onboardSkip: 'ข้ามไปก่อน',
    onboardNext: 'ถัดไป', onboardPrev: 'ก่อนหน้า', onboardFinish: 'เสร็จสิ้น',
    tourStep1: 'ดูยอดขาย สถานะงาน และ KPI สำคัญได้ที่นี่',
    tourStep2: 'เจาะลึกยอดขาย วิเคราะห์แต่ละช่องทาง และบันทึกยอดรายวัน',
    tourStep3: 'วางแผนงานด้วยปฏิทิน Kanban และ Timeline',
    tourStep4: 'จัดการสินค้า แคมเปญ และ PO',
    tourStep5: 'ค้นหาได้ทุกอย่างด้วย {0}',
    helpBtn: 'ช่วยเหลือ',

    // ---- Validation ----
    valRequired: 'กรุณากรอกข้อมูล', valPositive: 'กรุณากรอกตัวเลขที่มากกว่า 0',
    valNegative: 'ไม่สามารถกรอกตัวเลขติดลบได้',
  },

  en: {
    // ---- Common ----
    cancel: 'Cancel', save: 'Save', edit: 'Edit', delete: 'Delete', add: 'Add',
    search: 'Search', all: 'All', close: 'Close', confirm: 'Confirm', back: 'Back',
    loading: 'Loading...', saving: 'Saving...', saved: 'Saved',
    viewAll: 'View all', today: 'Today', month: 'Month', year: 'Year',
    status: 'Status', channel: 'Channel', campaign: 'Campaign', team: 'Team',
    revenue: 'Revenue', orders: 'Orders', target: 'Target', actual: 'Actual',
    task: 'Task', tasks: 'tasks', product: 'Product', customer: 'Customer',
    newCust: 'New customer', oldCust: 'Returning', person: 'people', piece: 'pcs',
    day: 'day', days: 'days', minute: 'min', hour: 'hr', ago: 'ago',
    yesterday: 'Yesterday', export: 'Export', unsavedTitle: 'Unsaved changes',
    unsavedMsg: 'You have unsaved data. Do you want to close?',
    discardClose: 'Close without saving', goBack: 'Go back',

    // ---- Nav ----
    navHome: 'Home', navSales: 'Sales', navPlanner: 'Planner', navFlows: 'Projects', subFlowBoard: 'All Projects', subFlowList: 'Task List', subFlowHistory: 'Activity', subMyTasks: 'My Tasks',
    navCatalog: 'Sales', navSystem: 'Settings', navLogs: 'Activity Log', subOverview: 'Sales Overview', subChannels: 'Sales Channels',
    subAds: 'Ads & Chat', subCustomers: 'Customers',
    subDaily: 'Daily Entry', subMonthly: 'Daily & Monthly', subStatus: 'Entry Status', subDataHub: 'Sales & data',
    subCalendar: 'Calendar', subKanban: 'Kanban Board', subTimeline: 'Timeline',
    subCampaigns: 'Campaigns', subReport: 'Sales report', subPerf: 'Performance', subOrders: 'Orders', subEntry: 'Sale entry', subShirts: 'Products', subStock: 'Stock', subCrm: 'CRM Overview', subHealth: 'Data health', subImport: 'Data', subCustomers2: 'Customers', subShopCust: 'Shop customers', subAudit: 'Activity Log', subRoles: 'User Roles', subTrash: 'Trash',
    panelSalesSub: 'View metrics, record sales & configure',
    panelPlannerSub: 'Tasks, campaigns & team calendar',
    panelCatalogSub: 'Products, campaigns & manufacturing',
    panelSystemSub: 'System settings & role management',

    // ---- Home ----
    homeOverview: "Today's Overview",
    greetMorning: 'Good morning', greetAfternoon: 'Good afternoon',
    greetEvening: 'Good evening', greetNight: 'Good night',
    synced: 'Synced', mtdTitle: 'Month-to-Date Sales (MTD)',
    monthTarget: 'Month target', runRate: 'Projected EOM', remaining: 'Remaining',
    watchOut: 'Watch out', focusToday: "Today's Focus", recentActivity: 'Recent Activity',
    channelSales: 'Sales Channels', dailySalesMonth: 'Daily sales this month',
    openSalesDash: 'Open Sales Dashboard',
    totalDays: 'Total {0} days', avgPerDay: 'Avg {0}/day', aboveAvg: 'Above average',
    ordersTotal: 'Total Orders', aov: 'Avg Order Value (AOV)',
    adCost: 'Ad Cost / ACOS', newCustCount: 'New Customers',
    vsLastMonth: 'vs last month', goodTrend: 'Strong trend',
    ceiling: 'Ceiling', ofRevenue: 'of revenue',
    paceOnTrack: 'On track', paceSlow: 'Slightly behind', paceOff: 'Off track',
    mustAvg: 'Need avg {0}/day for {1} more days',
    acosOver: 'Total ACOS {0} exceeds ceiling',
    fbAcosHigh: 'Facebook ACOS {0} highest — review budget',
    stockAlert: '{0} products low/out of stock',

    // ---- Sales ----
    salesMTD: 'Sales MTD', dayOf: 'Day', ofTarget: 'of target',
    setTarget: 'Set Target', channelRevShare: 'Revenue share by channel',
    darkNew: 'Dark = New customers', lightOld: 'Light = Returning',
    dailySales: 'Daily Sales', last3m: 'Last 3 months',
    yoy: 'Year-over-Year', inclProjection: 'Including projection (lighter)',
    adBudget: 'Ad Budget', totalBudget: 'Total Budget', spent: 'Spent',
    budgetRemain: 'Remaining', burnRate: 'Burn rate/day', projSpend: 'Projected spend',
    ofBudget: 'of budget', ofTime: 'of time',
    adPerformance: 'Ad Performance', adCampaigns: 'Ad Campaigns',
    createAdCamp: 'Create Ad Campaign',
    adRunning: 'Running', adWaiting: 'Pending', adDone: 'Completed',
    fbDeepDive: 'Facebook & Chat Deep Dive', avgReplyTime: 'Avg reply time',
    chatToOrder: 'Chat → Order', chat: 'Chats', costPer: 'Cost',
    perChat: 'per chat', perOrder: 'per order',
    msgVolume: 'Message Volume',
    custSegments: 'Customer Segments', updateSegments: 'Update Segments',
    clv: 'Customer Lifetime Value (CLV)', avgPerCust: 'Average per customer',
    histData: 'Last 6 months data', returningShare: 'Returning Customer Share',
    returningGoal: 'Goal: Increase Returning ≥ 35% by end of month',
    cohortRetention: 'Cohort Retention Table', startMonth: 'Start Month',
    monthN: 'Month {0}', newVsOldByChannel: 'New vs Returning by Channel',
    new: 'New', old: 'Returning', growth: 'Growth',

    // ---- Planner ----
    active: 'Active', done: 'Done', searchTask: 'Search tasks...',
    statusTodo: 'To-Do', statusInprogress: 'In Progress',
    statusReview: 'Review', statusDone: 'Done',
    statusTodoShort: 'To-Do', statusInprogressShort: 'Active',
    statusReviewShort: 'Review', statusDoneShort: 'Done',
    addTask: 'Add', noTasksDay: 'No tasks for this day',
    prevMonth: 'Previous month', nextMonth: 'Next month',
    moreTask: '+{0} tasks', dragHere: 'Drag cards here',
    overdue: 'Overdue',
    responsible: 'Assigned to', campProgress: 'Campaign Progress',
    campLive: 'Live', campPrepare: 'Preparing', campDone: 'Done',

    // ---- Catalog ----
    topProducts: 'Best-selling Products', addProduct: 'Add Product',
    price: 'Price', sold: 'Sold', stock: 'In Stock',
    topColors: 'Top Colors', topSizes: 'Top Sizes',
    stockOk: 'OK', stockLow: 'Low', stockOut: 'Out of Stock',
    campaigns_n: '{0} campaigns', campUpcoming: 'Upcoming',
    campInProgress: 'In Progress', campCompleted: 'Completed',
    createCampaign: 'Create Campaign',
    poTitle: 'Purchase Orders & Factory PO', openPO: 'New PO',
    quantity: 'Qty', orderDate: 'Order Date', arrivalDate: 'ETA',
    producing: 'In Production', arrived: 'Received',
    openPOAction: 'Create PO',

    // ---- System ----
    auditTitle: 'Activity Log', auditCreate: 'Created',
    auditUpdate: 'Updated', auditDelete: 'Deleted',
    rolesTitle: 'User Roles', roleAdmin: 'Admin',
    roleEditor: 'Editor', roleViewer: 'Viewer',
    addRole: 'Add / Edit Role', saveRole: 'Save Role',
    roleDesc: 'Admin can manage everything · Editor can record data · Viewer is read-only',
    trashTitle: 'Trash is empty',
    trashDesc: 'Deleted items are kept here for 30 days before permanent removal',

    // ---- Entry ----
    currentMonth: 'Current month', pastMonth: 'Past month',
    futureMonth: 'Upcoming', viewQuarter: 'Quarter view', viewMonth: 'Month view',
    notEntered: "Today's sales not recorded yet", entered: "Today's sales recorded",
    enterNow: 'Record now', recordSales: "Record Today's Sales",
    recordSalesDesc: 'Enter sales for all channels — Shopee, TikTok, Lazada, Facebook, LINE, CRM',
    entryCalendar: 'Entry Calendar', recent7: 'Last 7 days sales',
    enteredStatus: 'Recorded', notEnteredStatus: 'Not recorded',
    monthlySetup: 'Monthly Setup', setupFor: 'Settings for {0}',
    histEntry: 'Historical Data', histProgress: '{0}/{1} months entered',
    closed: 'Closed', inProgress: 'In Progress', preparing: 'Preparing',
    setTargetAdvance: 'Set target in advance', copyPrev: 'Copy from last month',
    readOnly: 'This month is closed. You can view historical data.',
    actualVsTarget: 'Actual vs Target', viewSummary: 'View Summary',
    completionStatus: 'Entry Completion Status', checklist: 'Entry Checklist',
    tips: 'Tips',
    tip1: 'Record daily sales before 10 PM to keep the Dashboard updated',
    tip2: 'Set new month targets by the 1st of each month',
    tip3: 'Update customer segments monthly for targeted promotions',

    // ---- Modals ----
    recordTitle: 'Record Daily Sales', recordSub: 'Enter each channel',
    step1: '1. Enter Data', step2: '2. Review & Save',
    reviewBefore: 'Review before saving', confirmSave: 'Confirm & Save',
    goBackEdit: 'Go back to edit', copyYesterday: 'Copy yesterday',
    date: 'Date', salesAmount: 'Sales (฿)', adCostField: 'Ad Cost (฿)',
    inquiry: 'Inquiries', dailyNote: 'Daily note',
    avgChatTime: 'Avg chat reply time (min)',
    todayTotal: "Today's Total", channelDetail: 'Channel Breakdown',
    mtdImpact: 'Impact on Monthly Target', mtdAfter: 'MTD after record',
    newRunRate: 'New Run Rate', overTarget: 'Over target',
    shortBy: 'Short by {0}', onTrack: 'On track', mustHurry: 'Must accelerate',
    thingsToKnow: 'Things to note', note: 'Note',
    aboveAvgPct: 'Sales {0}% above average', belowAvgPct: 'Sales {0}% below average',
    acosTooHigh: 'ACOS {0}% very high', acosOverCeil: 'ACOS {0}% exceeds {1}% ceiling',
    acosGood: 'ACOS {0}% good', paceGood: 'Pace {0}% on track', paceBad: 'Pace {0}% — must accelerate',

    taskTitle: 'Task title', taskDetail: 'Details', taskDate: 'Date',
    taskCampaign: 'Campaign', taskResponsible: 'Assigned to', taskChannel: 'Channel',
    taskStatus: 'Status', taskReminder: 'Reminder',
    noReminder: 'None', day1: '1 day', day3: '3 days', day7: '7 days',
    addTaskModal: 'Add New Task', editTaskModal: 'Edit Task',
    taskSubtext: 'Assign tasks with deadlines',
    saveEdit: 'Save Changes',

    addProductModal: 'Add Product', editProductModal: 'Edit Product',
    productName: 'Product Name', sellPrice: 'Sell Price (฿)',
    targetQty: 'Target Qty (pcs)', stockOnHand: 'Stock on Hand',
    reorderPoint: 'Reorder Point', soldQty: 'Sold',
    strategy: 'Strategy / Notes', saveProduct: 'Save Product',

    createCampModal: 'Create Campaign', editCampModal: 'Edit Campaign',
    campName: 'Campaign Name', campColor: 'Campaign Color',
    campStart: 'Start', campEnd: 'End', saveCampaign: 'Save Campaign',

    poModal: 'Open New PO', editPO: 'Edit PO',
    poProduct: 'Product', poQty: 'Quantity (pcs)',
    poOrderDate: 'Order Date', poArrivalDate: 'Expected Arrival', savePO: 'Save PO',

    monthlyTargetModal: 'Set Monthly Targets', monthlyTargetSub: 'Set sales targets and ad budget',
    totalTarget: 'Total Target (฿)', perChannel: 'Per Channel',
    channelSum: 'Channel total', matchTotal: 'Matches total target',
    diffTotal: 'Differs from total by {0}', adBudgetTotal: 'Total Ad Budget (฿)',
    adPerChannel: 'Ad Budget per Channel', newCustTarget: 'New Customer Target',
    acosCeiling: 'ACOS Ceiling %',

    adCampModal: 'Create Ad Campaign', editAdCamp: 'Edit Ad Campaign',
    platform: 'Platform', budget: 'Budget (฿)',
    startDate: 'Start Date', endDate: 'End Date', goal: 'Goal',

    segmentModal: 'Update Customer Segments', segmentSub: 'Group customers by behavior',
    segCount: 'Count', segRevPct: '% Revenue',
    totalCust: 'Total customers', totalRevPct: 'Total revenue %',
    shouldBe100: 'Should be 100%',

    histModal: 'Enter Historical Data', histSub: 'Monthly sales data for trend analysis',
    saveHist: 'Save Historical Data',

    // ---- Login ----
    loginTitle: 'Sign in to TMK', loginWelcome: 'Welcome back',
    email: 'Email', password: 'Password',
    agreeTerms: 'I agree to the terms and conditions',
    signIn: 'Sign In', orSignWith: 'Or sign in with',
    googleSignIn: 'Sign in with Google',
    loginHero1: 'Sales Command', loginHero2: 'and Marketing', loginHero3: 'All in One',
    loginDesc: 'Track sales across channels, plan campaigns, manage your team, and monitor business health in real-time',
    loginStat1: 'Monthly target', loginStat2: 'Sales channels', loginStat3: 'Real-time sync',

    // ---- Notifications ----
    notifications: 'Notifications',
    overdueBy: 'Overdue by {0} days', dueToday: 'Due today', dueIn: 'Due in {0} days',

    // ---- Profile ----
    lightMode: 'Light mode', darkMode: 'Dark mode', logout: 'Sign out',
    campaignSettings: 'Campaign settings', language: 'Language',

    // ---- Spotlight ----
    spotlightPlaceholder: 'Search tasks, products, campaigns...',
    spotlightHint: 'Type to search',
    spotlightCategories: 'Tasks · Products · Campaigns · Team · Channels · Navigation',
    noResults: 'No results for "{0}"',
    catTask: 'Tasks', catProduct: 'Products', catCampaign: 'Campaigns',
    catTeam: 'Team', catChannel: 'Channels', catNav: 'Navigation',
    goTo: 'Go to {0}', select: 'Select', open: 'Open',

    // ---- Toast ----
    toastSaved: 'Data saved successfully', toastDeleted: 'Data deleted',
    toastError: 'An error occurred', toastCopied: "Copied yesterday's data",
    toastExported: 'Data exported successfully',

    // ---- Onboarding ----
    onboardTitle: 'Welcome to TMK Operation',
    onboardSub: "Let's show you around",
    onboardStart: "Let's go", onboardSkip: 'Skip for now',
    onboardNext: 'Next', onboardPrev: 'Previous', onboardFinish: 'Finish',
    tourStep1: 'View sales, task status and key KPIs here',
    tourStep2: 'Dive deep into sales, analyze channels and record daily data',
    tourStep3: 'Plan your work with Calendar, Kanban and Timeline',
    tourStep4: 'Manage products, campaigns and POs',
    tourStep5: 'Search everything with {0}',
    helpBtn: 'Help',

    // ---- Validation ----
    valRequired: 'This field is required', valPositive: 'Please enter a positive number',
    valNegative: 'Negative numbers are not allowed',
  },
};

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('tmk-lang') || 'th'; } catch { return 'th'; }
  });

  const switchLang = useCallback((l) => {
    setLang(l);
    try { localStorage.setItem('tmk-lang', l); } catch { /* ignore */ }
  }, []);

  const t = useCallback((key, ...args) => {
    let str = T[lang]?.[key] || T.th[key] || key;
    args.forEach((a, i) => { str = str.split(`{${i}}`).join(a == null ? '' : a); });
    return str;
  }, [lang]);

  return (
    <LangContext.Provider value={{ lang, setLang: switchLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
