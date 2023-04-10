import json
import numpy as np
from flask import Flask, render_template, jsonify
from obspy import read, UTCDateTime

app = Flask(__name__)

fileurl = "http://eida.koeri.boun.edu.tr/fdsnws/dataselect/1/query?"

@app.route("/")
def index():
    with open("static/veriler.json", "r", encoding="utf-8") as f:
        global_data = json.load(f)
    return render_template("index.html", station_names=global_data["station_names"], station_codes=global_data["station_codes"])
    

@app.route("/station/<station_code>")
def station(station_code):
    with open("static/veriler.json", "r", encoding="utf-8") as f:
        global_data = json.load(f)
    station_names = global_data["station_names"]
    if station_code not in station_names:
        return "Station not found", 404

    fileurl = "http://eida.koeri.boun.edu.tr/fdsnws/dataselect/1/query?"
    starttime = UTCDateTime() - 360
    endtime = UTCDateTime()
    url = fileurl + f"starttime={starttime}&endtime={endtime}&station={station_code}"
    st = read(url)

    tr = st[0]
    delta = tr.stats.delta
    starttime = tr.stats.starttime.timestamp * 1000
    dates = [starttime + i * delta * 1000 for i in range(tr.stats.npts)]
    data = np.array(list(zip(dates, tr.data))).tolist()

    chart_data = {'data': data, 'station_name': global_data["station_names"][station_code], 'station_code': station_code}

    return jsonify(chart_data)


if __name__ == "__main__":
    app.run(debug=False)