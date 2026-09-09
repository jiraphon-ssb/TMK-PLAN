import { useState } from 'react';
import { Icon } from './components.jsx';
import tmkLogo from './assets/tmk-logo.png';
import { supabase } from './lib/supabaseClient.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState(() => { try { return localStorage.getItem('tmk-remember-email') || ''; } catch { return ''; } });
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [agree, setAgree] = useState(false);
  const [remember, setRemember] = useState(() => { try { return localStorage.getItem('tmk-remember') === 'true'; } catch { return false; } });
  const [showTerms, setShowTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const rememberEmail = (em) => {
    try {
      if (remember) { localStorage.setItem('tmk-remember', 'true'); localStorage.setItem('tmk-remember-email', em); }
      else { localStorage.removeItem('tmk-remember'); localStorage.removeItem('tmk-remember-email'); }
    } catch { /* ignore */ }
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    const em = email.trim().toLowerCase();
    if (!em) { setErr('กรุณากรอกอีเมล'); return; }
    if (!pw) { setErr('กรุณากรอกรหัสผ่าน'); return; }
    if (!agree) { setErr('กรุณายอมรับข้อตกลงก่อน'); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: em, password: pw });
      if (error) throw error;
      rememberEmail(em);
      onLogin?.(em);
    } catch (e2) {
      const m = e2.message || '';
      setErr(/invalid login/i.test(m) ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
        : /not confirmed/i.test(m) ? 'อีเมลยังไม่ได้ยืนยัน — ติดต่อแอดมิน'
        : 'เข้าสู่ระบบไม่สำเร็จ: ' + m);
    } finally { setBusy(false); }
  };

  const canSubmit = !busy && !!email.trim() && !!pw && agree;

  return (
    <>
      <div className="container relative h-screen flex-col items-center justify-center grid lg:max-w-none lg:px-0 bg-background text-foreground">
        <div className="flex h-full items-center p-4 lg:p-8">
          <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
            <div className="flex flex-col space-y-2 text-center">
              <img src={tmkLogo} alt="TMK" className="mx-auto h-12 w-12 object-contain mb-4" />
              <h1 className="text-2xl font-semibold tracking-tight">
                เข้าสู่ระบบ
              </h1>
              <p className="text-sm text-muted-foreground">
                ยินดีต้อนรับกลับมา
              </p>
            </div>
            <div className="grid gap-6">
              <form onSubmit={submit}>
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="email">อีเมล</Label>
                    <Input
                      id="email"
                      placeholder="name@tmk.co"
                      type="email"
                      autoCapitalize="none"
                      autoComplete="username"
                      autoCorrect="off"
                      disabled={busy}
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password">รหัสผ่าน</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPw ? "text" : "password"}
                        autoComplete="current-password"
                        disabled={busy}
                        value={pw}
                        onChange={e => setPw(e.target.value)}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full w-9 px-0 hover:bg-transparent text-muted-foreground"
                        onClick={() => setShowPw(!showPw)}
                      >
                        <Icon name="eye" className="size-4" />
                        <span className="sr-only">แสดงรหัสผ่าน</span>
                      </Button>
                    </div>
                  </div>
                  
                  {err && (
                    <div className="text-sm text-destructive font-medium bg-destructive/10 p-3 rounded-md">
                      {err}
                    </div>
                  )}

                  <div className="flex items-center space-x-2 mt-2">
                    <Checkbox id="remember" checked={remember} onCheckedChange={setRemember} />
                    <Label
                      htmlFor="remember"
                      className="text-sm font-normal cursor-pointer text-muted-foreground"
                    >
                      จำการเข้าสู่ระบบ
                    </Label>
                  </div>
                  <div className="flex items-start space-x-2">
                    <Checkbox id="terms" checked={agree} onCheckedChange={() => { if (!agree) setShowTerms(true); else setAgree(false); }} />
                    <Label
                      htmlFor="terms"
                      className="text-sm font-normal cursor-pointer text-muted-foreground leading-snug"
                    >
                      ยอมรับ <button type="button" className="underline underline-offset-4 hover:text-primary font-medium" onClick={() => setShowTerms(true)}>ข้อตกลงและกฎระเบียบ</button>
                    </Label>
                  </div>
                  
                  <Button disabled={!canSubmit} className="mt-2 w-full">
                    {busy ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
                  </Button>
                </div>
              </form>
            </div>
            <p className="px-8 text-center text-sm text-muted-foreground">
              ลืมรหัสผ่าน? ติดต่อผู้ดูแลระบบ
            </p>
          </div>
        </div>
      </div>

      <Dialog open={showTerms} onOpenChange={setShowTerms}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon name="shield" className="size-4" />
              </span>
              ข้อตกลงและกฎระเบียบการใช้งานระบบ
            </DialogTitle>
            <DialogDescription>
              TMK Operation — กรุณาอ่านก่อนยอมรับ
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto px-6 py-6 text-sm text-muted-foreground leading-relaxed space-y-6">
            <div>
              <h3 className="text-foreground font-semibold mb-2 text-base">1. ขอบเขตการใช้งาน</h3>
              <p>ระบบ TMK Operation เป็นเครื่องมือภายในสำหรับบริหารจัดการธุรกิจแบรนด์ TMK เท่านั้น ผู้ใช้งานต้องเป็นบุคลากรของบริษัทหรือได้รับอนุญาตจากผู้ดูแลระบบ ห้ามมิให้ใช้งานระบบเพื่อวัตถุประสงค์อื่นนอกเหนือจากการบริหารธุรกิจ</p>
            </div>
            
            <div>
              <h3 className="text-foreground font-semibold mb-2 text-base">2. บัญชีผู้ใช้และความปลอดภัย</h3>
              <p>ผู้ใช้งานต้องรักษาความลับของอีเมลและรหัสผ่าน ห้ามแบ่งปันข้อมูลการเข้าสู่ระบบกับบุคคลภายนอก หากพบว่ามีการเข้าถึงบัญชีโดยไม่ได้รับอนุญาต ให้แจ้งผู้ดูแลระบบทันที ผู้ใช้งานต้องรับผิดชอบต่อทุกการกระทำที่เกิดขึ้นภายใต้บัญชีของตน</p>
            </div>

            <div>
              <h3 className="text-foreground font-semibold mb-2 text-base">3. ข้อมูลที่เป็นความลับ</h3>
              <p>ข้อมูลทั้งหมดในระบบ ได้แก่ ยอดขาย ข้อมูลลูกค้า กลยุทธ์การตลาด ข้อมูลสินค้า ราคา ต้นทุน ค่าโฆษณา และข้อมูลทางธุรกิจอื่น ๆ ถือเป็นความลับทางการค้า ห้ามมิให้เปิดเผย คัดลอก แจกจ่าย หรือนำไปใช้นอกเหนือจากการปฏิบัติงาน การละเมิดอาจถูกดำเนินการทางกฎหมาย</p>
            </div>

            <div>
              <h3 className="text-foreground font-semibold mb-2 text-base">4. สิทธิ์การเข้าถึงและระดับผู้ใช้</h3>
              <p>ระบบแบ่งสิทธิ์เป็น 3 ระดับ: <strong>ผู้ดูแลระบบ</strong> (จัดการได้ทุกอย่าง รวมถึงสิทธิ์ผู้ใช้), <strong>แก้ไขได้</strong> (บันทึกยอดขาย จัดการงาน แก้ไขข้อมูล), <strong>ดูอย่างเดียว</strong> (เปิดดูข้อมูลได้แต่ไม่สามารถแก้ไข) ผู้ดูแลระบบเป็นผู้กำหนดสิทธิ์ของแต่ละบุคคล</p>
            </div>

            <div>
              <h3 className="text-foreground font-semibold mb-2 text-base">5. การบันทึกข้อมูลและความถูกต้อง</h3>
              <p>ผู้ใช้งานต้องกรอกข้อมูลยอดขายรายวันอย่างถูกต้องและตรงเวลา ข้อมูลที่บันทึกจะถูกใช้ในการวิเคราะห์ภาพรวมธุรกิจ การกรอกข้อมูลเท็จหรือบิดเบือนข้อมูลถือเป็นการกระทำที่ร้ายแรง ทุกการเปลี่ยนแปลงจะถูกบันทึกไว้ในประวัติการใช้งาน (Audit Log) เพื่อตรวจสอบย้อนหลัง</p>
            </div>

            <div className="bg-primary/5 p-4 rounded-lg border-l-4 border-primary">
              <div className="font-semibold text-primary mb-1">หมายเหตุ</div>
              <div className="text-sm">การกด "ยอมรับและดำเนินการต่อ" ถือว่าท่านได้อ่าน เข้าใจ และยินยอมปฏิบัติตามข้อตกลงและกฎระเบียบทั้งหมดข้างต้น</div>
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t flex-row justify-end gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setShowTerms(false)}>ปิด</Button>
            <Button onClick={() => { setAgree(true); setShowTerms(false); }}>
              <Icon name="check" className="mr-2 size-4" /> ยอมรับและดำเนินการต่อ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}


