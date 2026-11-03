import { test, expect, type Page } from '@playwright/test';
test.setTimeout(20000);
const state='1234567890abcdef'.repeat(4);
async function boundary(page:Page,loggedIn=false) {
 const observed={starts:[] as Record<string,string>[],callbacks:[] as Record<string,string>[],signedIn:loggedIn,fail:false};
 await page.route('**/api/public/gov-auth',r=>r.fulfill({json:{mode:'local',configured:true,iamAuthUrl:'https://auth.govcenter.co',serviceCode:'towntrack-test',callbackUrl:'http://127.0.0.1:5173/auth/callback'}}));
 await page.route('**/api/public/line',r=>r.fulfill({json:{enabled:false}}));
 await page.route('**/api/public/municipalities',r=>r.fulfill({json:[]}));
 await page.route('**/api/auth/csrf',r=>r.fulfill({json:{token:'test-csrf',headerName:'X-CSRF-TOKEN'}}));
 await page.route('**/api/auth/me',r=>observed.signedIn?r.fulfill({json:{id:'test-user',username:'sso-test',display_name:'SSO Test User',role:'OFFICER',department_id:'test-department'}}):r.fulfill({status:401,json:{message:'Sign in'}}));
 await page.route('**/api/auth/gov/start',async r=>{observed.starts.push(r.request().postDataJSON());expect(r.request().headers()['x-csrf-token']).toBe('test-csrf');await r.fulfill({json:{ok:true}});});
 await page.route('**/api/auth/sso-callback',async r=>{observed.callbacks.push(r.request().postDataJSON());expect(r.request().headers()['x-csrf-token']).toBe('test-csrf');if(observed.fail){await r.fulfill({status:503,json:{message:'Gov Center unavailable; restart sign-in'}});return;}observed.signedIn=true;await r.fulfill({json:{success:true,user:{role:'OFFICER'}}});});
 await page.route('https://auth.govcenter.co/**',r=>r.fulfill({contentType:'text/html',body:'<h1>IAM login test boundary</h1>'}));
 return observed;
}
test('SSO button registers matching state before redirect without token entry',async({page})=>{
 const seen=await boundary(page);await page.goto('/');await page.getByRole('button',{name:'เข้าสู่ระบบด้วย Gov Center',exact:true}).click();await expect(page.getByRole('heading',{name:'IAM login test boundary'})).toBeVisible();
 const url=new URL(page.url());expect(url.searchParams.get('service')).toBe('towntrack-test');expect(url.searchParams.get('callback')).toBe('http://127.0.0.1:5173/auth/callback');expect(seen.starts).toHaveLength(1);expect(seen.starts[0].state).toBe(url.searchParams.get('state'));expect(seen.starts[0].purpose).toBe('LOGIN');
});
test('callback rejects missing or mismatched state without exchange',async({page})=>{
 const seen=await boundary(page);await page.goto('/auth/callback?code=sample-one-use-code');await expect(page.getByRole('alert')).toContainText('เริ่มเข้าสู่ระบบใหม่');expect(seen.callbacks).toHaveLength(0);expect(page.url()).not.toContain('sample-one-use-code');
 await page.goto('/auth/callback?code=another-code&state=wrong');await expect(page.getByRole('alert')).toContainText('เริ่มเข้าสู่ระบบใหม่');expect(seen.callbacks).toHaveLength(0);
});
test('valid callback exchanges once in StrictMode then loads authenticated session',async({page})=>{
 const seen=await boundary(page);await page.addInitScript(s=>sessionStorage.setItem('gov_sso_state',s),state);await page.goto(`/auth/callback?code=sample-code&state=${state}`);await expect(page.getByText('SSO Test User',{exact:true})).toBeVisible();expect(seen.callbacks).toEqual([{code:'sample-code',state}]);expect(page.url()).not.toContain('sample-code');
});
test('provider failure does not automatically retry one-time code',async({page})=>{
 const seen=await boundary(page);seen.fail=true;await page.addInitScript(s=>sessionStorage.setItem('gov_sso_state',s),state);await page.goto(`/auth/callback?code=failed-code&state=${state}`);await expect(page.getByRole('alert')).toContainText('Gov Center unavailable');await expect(page.getByRole('button',{name:'เริ่มเข้าสู่ระบบใหม่',exact:true})).toBeVisible();expect(seen.callbacks).toHaveLength(1);
});
test('logged-in account explicitly initiates LINK rather than creating a new account',async({page})=>{
 const seen=await boundary(page,true);await page.goto('/');await page.getByRole('button',{name:'เชื่อมบัญชี Gov Center',exact:true}).click();await expect(page.getByRole('heading',{name:'IAM login test boundary'})).toBeVisible();expect(seen.starts[0].purpose).toBe('LINK');
});
