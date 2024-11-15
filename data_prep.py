# 地域手当マップのためのデータ処理
# R6人事院勧告の際の地域手当の大幅な変更について、地図に表すためのデータ処理を行う。


# ライブラリをロード
import os
import pandas as pd
import geopandas as gpd
import json

# shpを読み込み
japan_geom = gpd.read_file(os.path.join('data', 'N03-20240101_GML', 'N03-20240101.shp'))

# マージ用の列を作成
japan_geom['都道府県'] = japan_geom['N03_001']
japan_geom['市町村'] = japan_geom['N03_003'].fillna('') + japan_geom['N03_004']

# 図形の編集
japan_geom_edit = japan_geom.dissolve(by = 'N03_007', aggfunc = 'first')
japan_geom_edit = japan_geom_edit.reset_index()

# 手当のデータを読み込む
wage_fp = os.path.join('data', 'reference')
wage_sq = pd.read_csv(os.path.join(wage_fp, '地域手当支給地_現行.csv'))
wage_ap_pref = pd.read_csv(os.path.join(wage_fp, '地域手当支給地_勧告_都道府県.csv'), encoding = 'shift-jis')
wage_ap_city = pd.read_csv(os.path.join(wage_fp, '地域手当支給地_勧告_市町村.csv'), encoding = 'shift-jis')

# 列名の変更
wage_sq = wage_sq.rename(columns = {'支給地域': '市町村', '級地': '級地_現行'})
wage_ap_city =  wage_ap_city.rename(columns = {'級地': '新級地_市町村'})
wage_ap_pref =  wage_ap_pref.rename(columns = {'級地': '新級地_都道府県'})

# 全部のデータを統合
japan_geom_merged = japan_geom_edit.merge(
    wage_sq,
    on = ['都道府県', '市町村'],
    how = 'left'
).merge(
    wage_ap_pref,
    on = '都道府県',
    how = 'left'
).merge(
    wage_ap_city,
    on = ['都道府県', '市町村'],
    how = 'left'
)

# 特別区についてはどちらも1級地にする
japan_geom_merged['級地_現行'] = japan_geom_merged.apply(
    lambda row: '一級地' if '区' in row['N03_004'] else row['級地_現行'],
    axis = 1
)
japan_geom_merged['新級地_市町村'] = japan_geom_merged.apply(
    lambda row: 1.0 if '区' in row['N03_004'] else row['新級地_市町村'],
    axis = 1
)

# 市町村単位で上書きされているものだけ市町村のものに置き換える
japan_geom_merged['新級地_数字'] = japan_geom_merged[['新級地_都道府県', '新級地_市町村']].min(axis = 1)

# 新級地を名前で置き換え
translations = {
    1.0: '一級地',
    2.0: '二級地',
    3.0: '三級地',
    4.0: '四級地',
    5.0: '五級地',     
    6.0: '六級地',
    7.0: '七級地',     
}
japan_geom_merged['新級地'] = japan_geom_merged['新級地_数字'].apply(
    lambda x: '指定なし' if pd.isna(x) else translations[x] 
)

# 指定なしを埋める
japan_geom_merged['級地_現行'] = japan_geom_merged['級地_現行'].fillna('指定なし')

# 地域手当を割当

# 現行の支給割合
percentage_old = {
    '一級地': 20,
    '二級地': 16,
    '三級地': 15,
    '四級地': 12,
    '五級地': 10,
    '六級地': 6,
    '七級地': 3,
    '指定なし': 0    
}

# 新たな支給割合
percentage_new = {
    '一級地': 20,
    '二級地': 16,
    '三級地': 12,
    '四級地': 8,
    '五級地': 4,
    '指定なし': 0
}

# 各地域に割り当て
japan_geom_merged['地域手当_現行'] = japan_geom_merged['級地_現行'].apply(lambda x: percentage_old[x])
japan_geom_merged['地域手当_勧告'] = japan_geom_merged['新級地'].apply(lambda x: percentage_new[x])

# 差を計算
japan_geom_merged['地域手当_変動'] = japan_geom_merged['地域手当_勧告'] - japan_geom_merged['地域手当_現行']

# データを保存
japan_geom_merged.to_file(os.path.join('data','area_salary.geojson'), driver = 'GeoJSON')

# 簡単にした図形を保存
japan_geom_merged_simplify = japan_geom_merged.copy()
japan_geom_merged_simplify['geometry'] = japan_geom_merged_simplify['geometry'].simplify(0.0003)
japan_geom_merged_simplify.to_file(os.path.join('data','area_salary_simple.geojson'), driver = 'GeoJSON')

# ----- 官署の処理 -----

# データをロード
offices_geom = gpd.read_file(os.path.join('data', 'P28-22', 'P28-22.shp'))

# 浜松市のデータを編集
# 行政区再編について反映
hamamatsu_dict = {
    22131: 22138, # 中区→中央区
    22132: 22138, # 東区→中央区
    22133: 22138, # 西区→中央区
    22134: 22138, # 南区→中央区
    22135: 22139, # 浜北区→浜名区
    22136: 22139, # 北区→浜名区
    22137: 22140, # 天竜区→天竜区
}

# 置換
offices_geom['P28_001'] = offices_geom['P28_001'].apply(lambda x: str(hamamatsu_dict[int(x)]) if int(x) in hamamatsu_dict else x)

# 市町村データとマージ
offices_geom_merged = offices_geom.merge(
    japan_geom_merged.drop(columns = 'geometry'),
    left_on = 'P28_001',
    right_on = 'N03_007',
    how = 'left'
)

# 保存
offices_geom_merged.to_file(os.path.join('data', 'offices_data.geojson'), driver = 'GeoJSON')

# ----- 期間分類コード -----

# データのロード
fac_class = pd.read_csv(os.path.join('data', 'reference', 'facclasscd.csv'), encoding='cp932')

# dictに変換してjsonで保存
fac_dict = fac_class.set_index('code').to_dict()['type']

with open(os.path.join('data', 'reference', 'fac_class.json'), 'w', encoding = 'utf-8') as fp:
    json.dump(fac_dict, fp, ensure_ascii = False)