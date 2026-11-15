"""Independent decimal cash/units ledger, using transmitted input prices only."""
import json,subprocess,decimal,math
D=decimal.Decimal;decimal.getcontext().prec=40
cases=json.loads(subprocess.check_output(['node','tools/dump.mjs'],text=True));n=0;maxerr=0

def near(a,b):
 global n,maxerr
 a=float(a);b=float(b);err=abs(a-b)/max(1,abs(a),abs(b));maxerr=max(maxerr,err);n+=1
 assert math.isfinite(a) and math.isfinite(b) and err<1e-11,(a,b,err)
for case in cases:
 bars=case['bars'];cl=[D(str(b['close']))for b in bars];op=[D(str(b['open']))for b in bars];cost=D(case['bps'])/10000
 cash=D(10000);units=D(0);fees=D(0);peak=D(10000);mdd=D(0);bf=D(10000)*cost/(1+cost);bu=D(10000)/op[160]/(1+cost);fills=[]
 for row in case['rows']:
  i=row['index'];f=sum(cl[i-case['fast']:i])/case['fast'];s=sum(cl[i-case['slow']:i])/case['slow'];target=int(f-s>D('1e-12')*max(f,s));near(f,row['fast']);near(s,row['slow']);near(target,row['target']);paid=D(0)
  action=1 if units else 0
  if target and not units:
   action=2;notional=cash/(1+cost);paid=cash-notional;units=notional/op[i];cash=D(0);fills.append((i,'BUY','open',units,paid))
  elif not target and units:
   action=3;paid=units*op[i]*cost;cash=units*op[i]-paid;fills.append((i,'SELL','open',units,paid));units=D(0)
  bv=bu*cl[i]
  if i==len(bars)-1:
   bf+=bv*cost;bv*=1-cost
   if units:
    extra=units*cl[i]*cost;paid+=extra;cash=units*cl[i]-extra;fills.append((i,'SELL','end close',units,extra));units=D(0)
  fees+=paid;wealth=cash+units*cl[i];peak=max(peak,wealth);dd=wealth/peak-1;mdd=min(mdd,dd)
  for key,val in [('action',action),('shares',units),('cash',cash),('equity',wealth),('benchmark',bv),('fee',paid),('fees',fees),('benchmarkFees',bf),('drawdown',dd)]:near(val,row[key])
 near(mdd,case['maxDrawdown']);assert len(fills)==len(case['fills'])
 for x,t in zip(fills,case['fills']):assert (x[0],x[1],x[2])==(t['index'],t['side'],t['phase']);near(x[3],t['quantity']);near(x[4],t['fee'])
print(f'{n} independent Decimal-ledger comparisons, max normalized error {maxerr:.3g}')
