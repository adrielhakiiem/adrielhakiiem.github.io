"""
a small attempt at understanding — data preparation.

reads cocteau_twins_discography.csv (spotify audio features, collected 2022),
cleans it, runs the analysis used in the essay and writes ../data.js.

run:  python3 prepare_data.py
needs: pandas, numpy, scipy, scikit-learn
"""
import json, re
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

HERE = Path(__file__).parent
raw = pd.read_csv(HERE / "cocteau_twins_discography.csv")
raw["copy_id"] = raw.album_img.str[-12:]          # one cover url = one pressing / edition on spotify
raw["remaster"] = raw.track_name.str.contains("Remastered", case=False)


def song_key(title):
    """title without edition suffixes, for matching the same song across releases."""
    t = re.sub(r"\s*-\s*(remastered.*|.*version.*|remixed|.*session.*|.*remix)$", "", title, flags=re.I)
    t = re.sub(r"\(.*?\)", "", t)
    return re.sub(r"[^a-z]", "", t.lower())


def clean_title(title):
    return re.sub(r"\s*-\s*Remastered 2006$", "", title).strip()


raw["song"] = raw.track_name.map(song_key)

# ---------------------------------------------------------------- 1. releases
# studio albums by original release year. the csv's album_year is the year of the
# edition spotify lists, so it is not trusted (one four-calendar café copy says 1991).
STUDIO = {
    "Garlands": 1982, "Head Over Heels": 1983, "Treasure": 1984, "Victorialand": 1986,
    "The Moon and the Melodies": 1986, "Blue Bell Knoll": 1988, "Heaven or Las Vegas": 1990,
    "Four-Calendar Café": 1993, "Milk & Kisses": 1996,
}
raw["family"] = raw.album_name.map(lambda a: "Four-Calendar Café" if "calend" in a.lower() else a)

# four-calendar café and milk & kisses each appear as several copies. prefer a copy
# that is not the 2006 remaster, and among those the one whose numbers sit closest to
# the per-song median of every copy (the other non-remaster copy is an outlier).
def pick_copy(family):
    sub = raw[raw.family == family]
    cols = ["energy", "valence", "acousticness", "danceability", "loudness"]
    med = sub.groupby("song")[cols].median()
    best = None
    for cid, g in sub.groupby("copy_id"):
        if g.remaster.any():
            continue
        d = (g.set_index("song")[cols] - med).abs()
        d["loudness"] /= 20
        score = d.values.sum()
        if best is None or score < best[1]:
            best = (cid, score)
    return best[0]

PICK = {f: pick_copy(f) for f in ["Four-Calendar Café", "Milk & Kisses"]}
is_studio = raw.family.isin(STUDIO) & raw.apply(lambda r: r.family not in PICK or r.copy_id == PICK[r.family], axis=1)
S = raw[is_studio].copy()
S["year"] = S.family.map(STUDIO)
S["album"] = S.family
S["title"] = S.track_name.map(clean_title)
S.loc[S.title == "rilkean Heart", "title"] = "Rilkean Heart"

# ---------------------------------------------------------------- 2. recordings outside the albums
# compilations repeat album tracks. a compilation row counts as the same recording as a
# studio track when the song matches and the running time is within 4 seconds
# (remasters trim a second or three of silence), or when it is tagged "remastered 2006".
COMPS = ["The Pink Opaque", "Cocteau Twins Singles Collection", "Stars And Topsoil - A Collection 1982-1990",
         "Lullabies To Violaine (Volume One)", "Treasure Hiding: The Fontana Years"]
C = raw[raw.album_name.isin(COMPS)].copy()
studio_dur = S.groupby("song").duration_ms.apply(list).to_dict()
C["dupe_of_album"] = C.apply(lambda r: r.remaster or any(abs(r.duration_ms - d) <= 4000 for d in studio_dur.get(r.song, [])), axis=1)
E = C[~C.dupe_of_album].copy()
# the same non-album recording on two compilations: keep its first appearance (oldest compilation)
E["comp_year"] = E.album_year
E = E.sort_values("comp_year")
E["dkey"] = E.song + "_" + (E.duration_ms // 3000).astype(str)
E = E.drop_duplicates("dkey")
E["title"] = E.track_name.map(clean_title)
E["album"] = E.album_name

# what happened to every row (drives the 259-square chart)
raw["fate"] = "copy"                                  # another copy of a studio album
raw.loc[S.index, "fate"] = "studio"
raw.loc[C.index[C.dupe_of_album], "fate"] = "compdup"  # an album recording repeated on a compilation
raw.loc[C.index[~C.dupe_of_album & ~C.index.isin(E.index)], "fate"] = "compdup"
raw.loc[E.index, "fate"] = "extra"

# ---------------------------------------------------------------- 3. the cleaning log
dup_rows = len(raw) - len(S) - len(E)
log = {
    "rows": len(raw),
    "spotify_releases": raw.copy_id.nunique(),
    "album_names": raw.album_name.nunique(),
    "studio_tracks": len(S),
    "extra_recordings": len(E),
    "set_aside": int(dup_rows),
    "fcc_copies": int(raw[raw.family == "Four-Calendar Café"].copy_id.nunique()),
    "mk_copies": int(raw[raw.family == "Milk & Kisses"].copy_id.nunique()),
}

# ---------------------------------------------------------------- 4. same song, many copies
# every copy of the four-calendar café songs, including the treasure hiding box set.
fcc_songs = S[S.album == "Four-Calendar Café"].song.tolist()
mk_songs = S[S.album == "Milk & Kisses"].song.tolist()
copies = raw[raw.song.isin(fcc_songs + mk_songs)].copy()
copies = copies[~copies.track_name.str.contains("Version|Session", case=False)]


def copy_label(r):
    name = r.album_name
    tag = "remastered 2006" if r.remaster else "no remaster tag"
    return f"{name} · listed {r.album_year} · {tag}"


copies["label"] = copies.apply(copy_label, axis=1)
# the copy of each album whose numbers sit furthest from the others
ODD = set()
for fam_name in PICK:
    sub = raw[raw.family == fam_name]
    med = sub.groupby("song").energy.median()
    dev = sub.groupby("copy_id")[["song", "energy"]].apply(lambda g: (g.set_index("song").energy - med).abs().mean())
    ODD.add(dev.idxmax())
odd_loud = {c: round(float(raw[raw.copy_id == c].loudness.mean() - raw[(raw.family == raw[raw.copy_id == c].family.iloc[0]) & (raw.copy_id != c)].loudness.mean()), 1) for c in ODD}

versions = []
for song, g in copies.groupby("song", sort=False):
    base = S[S.song == song].iloc[0]
    versions.append({
        "title": base.title, "album": base.album,
        "copies": [{"label": r.label, "energy": r.energy, "valence": r.valence, "tempo": round(r.tempo, 1),
                    "loudness": r.loudness,
                    "kind": "chosen" if r.copy_id == PICK.get(base.album) else "odd" if r.copy_id in ODD else "other"}
                   for r in g.itertuples()],
    })
tempo_disagree = sum(1 for v in versions
                     if max(c["tempo"] for c in v["copies"]) / min(c["tempo"] for c in v["copies"]) > 1.25)
energy_range = [max(c["energy"] for c in v["copies"]) - min(c["energy"] for c in v["copies"]) for v in versions]
loud_energy = stats.spearmanr(copies.loudness, copies.energy)

# ---------------------------------------------------------------- 5. the analysis
order = sorted(STUDIO, key=lambda a: (STUDIO[a], a != "Victorialand"))
feat = ["energy", "valence", "acousticness", "danceability", "instrumentalness", "loudness"]

ev_rho = stats.spearmanr(S.energy, S.valence)
energetic = S.energy >= 0.5
ev = {
    "rho": round(ev_rho.statistic, 2), "p": float(ev_rho.pvalue),
    "n": len(S), "energetic": int(energetic.sum()),
    "energetic_low_valence": int((energetic & (S.valence < 0.5)).sum()),
    "quiet_bright": int((~energetic & (S.valence >= 0.5)).sum()),
    "median_valence": round(S.valence.median(), 3), "median_energy": round(S.energy.median(), 3),
}
yr_val = stats.spearmanr(S.year, S.valence)
yr_inst = stats.spearmanr(S.year, S.instrumentalness)
corr = S[feat + ["tempo"]].corr(method="spearman").round(2)

# sonic families: k-means on standardised features. tempo is left out on purpose —
# section 4 shows spotify's tempo often flips between half and double time.
X = StandardScaler().fit_transform(S[feat])
sil = {k: round(silhouette_score(X, KMeans(k, n_init=50, random_state=0).fit(X).labels_), 3) for k in range(2, 8)}
K = 4
km = KMeans(K, n_init=50, random_state=0).fit(X)
S["cluster"] = km.labels_
# name clusters by their medians so the labels survive re-runs
prof = S.groupby("cluster")[feat].median()
names = {}
names[prof.acousticness.idxmax()] = "hush"
rest = prof.drop(index=list(names))
names[rest.instrumentalness.idxmax()] = "roar"
rest = rest.drop(index=list(names)[-1:])
names[rest.valence.idxmax()] = "glow"
names[rest.valence.idxmin()] = "dusk"
S["family_name"] = S.cluster.map(names)

pca = PCA(2).fit(X)
xy = pca.transform(X)
# orient: right = more energetic, up = brighter (the sign of a pca axis is arbitrary)
flip = np.array([np.sign(np.corrcoef(xy[:, 0], S.energy)[0, 1]), np.sign(np.corrcoef(xy[:, 1], S.valence)[0, 1])])
xy *= flip
S["x"], S["y"] = xy[:, 0], xy[:, 1]

scaler = StandardScaler().fit(S[feat])
Xs = scaler.transform(S[feat])
D = np.sqrt(((Xs[:, None, :] - Xs[None, :, :]) ** 2).sum(-1))

# project the non-album recordings onto the same map; family = nearest centre
Xe = scaler.transform(E[feat])
xe = pca.transform(Xe) * flip
E["x"], E["y"] = xe[:, 0], xe[:, 1]
E["family_name"] = [names[c] for c in km.predict(Xe)]
De = np.sqrt(((Xe[:, None, :] - Xs[None, :, :]) ** 2).sum(-1))

S = S.reset_index(drop=True)
E = E.reset_index(drop=True)


def rec(r, kind, i, dists):
    nn = np.argsort(dists[i])
    nn = [int(j) for j in nn if not (kind == "album" and j == i)][:5]
    return {
        "id": f"{'a' if kind == 'album' else 'e'}{i}", "kind": kind,
        "title": r.title, "album": r.album, "year": int(r.year) if kind == "album" else int(r.album_year),
        "energy": r.energy, "valence": r.valence, "acousticness": round(r.acousticness, 4),
        "danceability": r.danceability, "instrumentalness": round(r.instrumentalness, 4),
        "loudness": r.loudness, "tempo": round(r.tempo, 1), "duration": int(r.duration_ms // 1000),
        "mode": int(r["mode"]), "family": r.family_name, "x": round(float(r.x), 3), "y": round(float(r.y), 3),
        "img": r.album_img, "nn": [f"a{j}" for j in nn], "nn_d": [round(float(dists[i][j]), 2) for j in nn],
    }


tracks = [rec(r, "album", i, D) for i, r in S.iterrows()]
extras = [rec(r, "extra", i, De) for i, r in E.iterrows()]

albums = []
for a in order:
    g = S[S.album == a]
    albums.append({
        "name": a, "year": STUDIO[a], "n": len(g),
        "cover": g.album_img.iloc[0],
        **{f: round(float(g[f].median()), 3) for f in feat + ["tempo"]},
        "major": round(float(g["mode"].mean()), 2),
        "minutes": round(g.duration_ms.sum() / 60000, 1),
        "families": g.family_name.value_counts().to_dict(),
    })

families = {}
for c, nm in names.items():
    g = S[S.cluster == c]
    families[nm] = {"n": len(g), **{f: round(float(g[f].median()), 3) for f in feat}}

out = {
    "log": log, "ev": ev,
    "trend": {"valence_rho": round(yr_val.statistic, 2), "valence_p": float(yr_val.pvalue),
              "instr_rho": round(yr_inst.statistic, 2), "instr_p": float(yr_inst.pvalue)},
    "versions": versions,
    "versions_stats": {"songs": len(versions), "tempo_disagree": tempo_disagree,
                       "max_energy_range": round(max(energy_range), 3),
                       "loud_energy_rho": round(loud_energy.statistic, 2),
                       "odd_loudness_gap": {raw[raw.copy_id == c].family.iloc[0]: v for c, v in odd_loud.items()}},
    "corr": {"cols": corr.columns.tolist(), "m": corr.values.tolist()},
    "silhouette": sil, "pca_var": [round(v, 3) for v in pca.explained_variance_ratio_],
    "pca_loadings": {f: [round(pca.components_[0][i], 2), round(pca.components_[1][i], 2)] for i, f in enumerate(feat)},
    "families": families, "albums": albums, "tracks": tracks, "extras": extras,
    "rows": [{"t": r.track_name, "a": r.album_name, "y": int(r.album_year), "f": r.fate} for r in raw.itertuples()],
    "quiet_bright": S[(S.energy < 0.5) & (S.valence >= 0.5)][["title", "album", "energy", "valence"]].to_dict("records"),
}
(HERE.parent / "data.js").write_text("window.CT = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")

print(raw.fate.value_counts().to_dict(), out["quiet_bright"])
print(json.dumps({k: out[k] for k in ["log", "ev", "trend", "versions_stats", "silhouette", "pca_var", "pca_loadings", "families"]}, indent=1))
print(corr)
print(pd.DataFrame(albums).drop(columns=["cover"]).to_string())
print(E[["album", "title", "family_name"]].to_string())
