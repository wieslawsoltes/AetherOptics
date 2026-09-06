"""UI integration checks for the built self-contained page.
Use a local Chromium binary (CHROMIUM env), no network dependencies.
This test injects local HTML in an opaque about:blank context; the app honestly
uses its main-thread Float64 and memory-only fallbacks there. It does not claim
to validate secure-context WebGPU, module workers, or IndexedDB.
"""
from playwright.sync_api import sync_playwright
from pathlib import Path
import json, os, time
root=Path(__file__).resolve().parents[1]
checks=[]
def check(name, condition, detail=None):
 checks.append({'name':name,'passed':bool(condition),'detail':detail})
 print('CHECK',name, bool(condition),flush=True)
 if not condition: raise AssertionError(name+': '+str(detail))
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1600,'height':1000},device_scale_factor=1)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content((root/'dist/index.html').read_text(),wait_until='load')
 page.wait_for_function("document.documentElement.dataset.ready==='true'",timeout=30000)
 def calc():page.evaluate('()=>aether.calculate()')
 def cmd(name,data=None):return page.evaluate('([name,data])=>aether.command(name,data)',[name,data or {}])
 def close():
  if page.locator('#dialog').evaluate('(e)=>e.open'):page.locator('#dialog-close').click()
 def snap(name):page.screenshot(path=str(root/'docs'/name),full_page=True)
 initial=page.evaluate('({rms:aether.result.rms,efl:aether.result.paraxial.efl,valid:aether.result.valid,total:aether.result.total,backend:aether.result.backend})')
 check('Initial real calculation',initial['rms']>0 and initial['valid']==initial['total'],initial)
 check('Fallback identified honestly','fallback' in initial['backend'])
 page.wait_for_timeout(350);snap('workbench-2d.png')
 radius=page.locator('#lens-tbody input[data-id="crown-front"][data-param="radius"]')
 radius.fill('7 cm');radius.press('Enter');calc()
 check('Lens editor unit-aware change',page.evaluate('aether.model.surfaces[1].radius')==70)
 check('Edited curvature changes computed EFL',abs(page.evaluate('aether.result.paraxial.efl')-initial['efl'])>1)
 cmd('undo');calc();check('Undo restores optics',abs(page.evaluate('aether.result.paraxial.efl')-initial['efl'])<1e-9)
 cmd('redo');calc();check('Redo restores radius',page.evaluate('aether.model.surfaces[1].radius')==70)
 radius.fill('1');radius.press('Enter');calc();check('Invalid cap rejected transactionally',page.evaluate('aether.model.surfaces[1].radius')==70)
 cmd('undo');calc()
 cmd('3d');page.wait_for_timeout(100);snap('workbench-3d.png');check('3D triangle scene generated',page.evaluate('aether.state.renderer.scene.triangles.length')>1000)
 cmd('2d');cmd('analysis-fans');page.wait_for_timeout(100);check('Linked ray fans',page.locator('#fan-y-0').count()==1)
 cmd('analysis-opd');calc();page.wait_for_timeout(100);snap('wavefront.png');check('OPD computes real reference sphere',page.evaluate('Number.isFinite(aether.result.fields[0].wavefront[1].pv)'))
 cmd('analysis-spot');calc()
 cmd('fields');page.locator('#fy-2').fill('4 deg');page.locator('#dialog-actions').get_by_role('button',name='Apply fields').click();calc();check('Field angles editable',page.evaluate('aether.model.fields[2].y')==4)
 cmd('undo');calc()
 cmd('wavelengths');page.locator('#wl-0').fill('0.49 um');page.locator('#dialog-actions').get_by_role('button',name='Apply wavelengths').click();calc();check('Wavelength units converted',abs(page.evaluate('aether.model.wavelengths[0].um')-.49)<1e-12)
 cmd('undo');calc()
 cmd('custom-glass');page.locator('#cg-name').fill('TEST-CAUCHY');page.locator('#dialog-actions').get_by_role('button',name='Add material',exact=True).click();check('Custom Cauchy glass persisted in model',page.evaluate("aether.model.customGlasses[0].name")== 'TEST-CAUCHY');close();cmd('undo');calc()
 for name in ['properties','surface-properties','glass','engine','optimization','sweep','report','export','diagnostics','help','about','examples']:
  cmd(name);check('Dialog: '+name,page.locator('#dialog').evaluate('(e)=>e.open'));close()
 cmd('example',{'example':'singlet'});calc()
 page.evaluate("()=>{let m=aether.model;m.surfaces.at(-2).thickness=59;m.optimization.operands=[{type:'RMS',target:0,tolerance:.01,weight:1}];m.optimization.iterations=10;aether.setModel(m)}")
 calc();before=page.evaluate('aether.result.rms')
 cmd('optimization');page.locator('#dialog-actions').get_by_role('button',name='Run optimization').click();page.wait_for_function("document.getElementById('dialog-title').textContent==='Optimization result'",timeout=30000)
 opt=page.evaluate('({initial:aether.state.optimization.initial,final:aether.state.optimization.final,reason:aether.state.optimization.reason})')
 check('Live LM merit converges',opt['final']<opt['initial']*.1,opt)
 snap('optimization.png')
 page.locator('#dialog-actions').get_by_role('button',name='Apply candidate').click();calc();check('Optimization applied and full trace improves',page.evaluate('aether.result.rms')<before*.3)
 page.evaluate("()=>{aether.state.selected=aether.model.surfaces.at(-2).id}")
 cmd('sweep');page.locator('#sw-param').select_option('thickness');page.locator('#sw-start').fill('49');page.locator('#sw-end').fill('53');page.locator('#sw-steps').fill('7');page.locator('#dialog-actions').get_by_role('button',name='Run sweep').click();page.wait_for_function("document.getElementById('dialog-title').textContent==='Parameter sweep results'",timeout=30000)
 sweep=page.evaluate('aether.state.sweep.rows');check('Sweep computes nonconstant results',len(sweep)==7 and max(x['rms'] for x in sweep)>min(x['rms'] for x in sweep)*1.5,sweep)
 snap('sweep.png');close()
 cmd('benchmarks');bench=page.evaluate('aether.state.benchmarks');check('Browser Float64 benchmarks',bench['passed']==bench['total'],{'passed':bench['passed'],'total':bench['total']});close()
 cmd('insert');calc();check('Surface insertion',page.evaluate('aether.model.surfaces.length')==5);cmd('undo');calc()
 cmd('example',{'example':'mirror'});calc();r=page.evaluate('({rms:aether.result.fields[0].rms,pv:aether.result.fields[0].wavefront[1].pv})');check('Reflective exact focus visible',r['rms']<1e-9 and r['pv']<1e-7,r)
 cmd('example',{'example':'achromat'});calc();page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(100);snap('mobile.png');check('Mobile no document overflow',page.evaluate('document.documentElement.scrollWidth')<=390)
 check('No browser JavaScript exceptions',not errors,errors)
 result={'environment':{'chromium':b.version,'method':'Local HTML injected into about:blank','graphics':'Canvas2D','compute':'Float64 main-thread fallback','gpuTested':False,'workersTested':False,'storageTested':False},'passed':sum(x['passed'] for x in checks),'total':len(checks),'checks':checks,'pageErrors':errors}
 (root/'docs/browser-test-results.json').write_text(json.dumps(result,indent=2))
 print(json.dumps(result,indent=2));b.close()
