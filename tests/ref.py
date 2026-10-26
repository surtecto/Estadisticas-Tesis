import json, numpy as np, pandas as pd
from scipy import stats
import statsmodels.api as sm, statsmodels.formula.api as smf
from statsmodels.stats.multicomp import pairwise_tukeyhsd
d=pd.DataFrame(json.load(open('node_modules/vega-datasets/data/penguins.json'))).dropna()
d.columns=['sp','isl','bl','bd','fl','bm','sex']
d=d[d.sex.isin(['MALE','FEMALE'])]
R={}
a=d[d.sp=='Adelie'].bl.values; c=d[d.sp=='Chinstrap'].bl.values; g=d[d.sp=='Gentoo'].bl.values
R['sw']=list(stats.shapiro(a)); R['sw_small']=list(stats.shapiro([2.1,3.4,1.9,5.6,4.4,3.3,2.8,6.1,3.9,4.0]))
R['welch']=[*stats.ttest_ind(a,c,equal_var=False)]; R['student']=[*stats.ttest_ind(a,c)]
R['mw']=list(stats.mannwhitneyu(a,c,alternative='two-sided'))
R['mw_exact']=list(stats.mannwhitneyu([1.1,2.3,3.5,4.2,5.9],[2.2,6.1,7.4,8.8,9.3,3.1],method='exact'))
R['wil']=list(stats.wilcoxon(d.bl.values[:30], d.bd.values[:30]*2.3))
R['kw']=list(stats.kruskal(a,c,g)); R['anova']=list(stats.f_oneway(a,c,g))
R['lev']=list(stats.levene(a,c,g,center='median'))
t=pairwise_tukeyhsd(np.concatenate([a,c,g]), ['A']*len(a)+['C']*len(c)+['G']*len(g))
R['tukey']=[list(map(float,x)) for x in zip(t.meandiffs,t.pvalues,t.confint[:,0],t.confint[:,1])]
R['pear']=list(stats.pearsonr(d.bl,d.fl)); R['spear']=list(stats.spearmanr(d.bl,d.fl)); R['kend']=list(stats.kendalltau(d.bl,d.fl))
ct=pd.crosstab(d.sp,d.isl).values; ch=stats.chi2_contingency(ct,correction=False); R['chi']=[ch[0],ch[1],ch[2]]
R['fisher']=list(stats.fisher_exact([[8,2],[1,5]]))
m=smf.ols('bm ~ fl + bl + C(sex)',data=d).fit(); R['ols']={'b':list(m.params),'se':list(m.bse),'r2':m.rsquared,'f':m.fvalue,'aic':m.aic,'dw':float(sm.stats.durbin_watson(m.resid))}
d['y']=(d.sex=='MALE').astype(int); l=smf.logit('y ~ bm + bd',data=d).fit(disp=0); R['logit']={'b':list(l.params),'se':list(l.bse),'llf':l.llf,'pr2':l.prsquared}
from statsmodels.stats.anova import anova_lm
m2=smf.ols('bm ~ C(sp,Sum)*C(sex,Sum)',data=d).fit(); a3=anova_lm(m2,typ=3); R['anova2']=[list(a3['sum_sq']),list(a3['F'])]
R['skew']=[float(stats.skew(a,bias=False)), float(stats.kurtosis(a,bias=False))]
from statsmodels.sandbox.stats.runs import mcnemar
R['fried']=list(stats.friedmanchisquare(d.bl.values[:20],d.bd.values[:20]*2.2,d.fl.values[:20]/4.6))
from scipy.stats import studentized_range
R['ptukey']=[float(studentized_range.cdf(3.5,3,20)), float(studentized_range.cdf(2.1,5,60)), float(studentized_range.ppf(0.95,4,30))]
json.dump(json.loads(json.dumps(R).replace('NaN','null')),open('tests/ref.json','w'))
print('ok', len(d))
