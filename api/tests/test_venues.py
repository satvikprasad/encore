"""Venue-site parsers (seed/fetch_venues.py) and ticket-offer matching (app/tickets.py), on inline samples."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from seed import fetch_venues as fv  # noqa: E402

from app import tickets  # noqa: E402

SFA = """
<div class="eventItem entry parking clearfix"> <div class="thumb"><a href="https://www.statefarmarena.com/events/detail/weezer"><img src="https://x/weezer.jpg" alt=""/></a></div>
<div class="date" aria-label="October 10 2026"></div>
<h3 class="title"><a href="https://www.statefarmarena.com/events/detail/weezer" title="More Info">Weezer: The Gathering</a></h3>
<h4 class="tagline"> with Ben Kweller </h4> <span class="start"> 7:00 PM</span>
<a href="https://www.ticketmaster.com/weezer-atlanta-georgia-10-10-2026/event/0E00ABCDEF123456?utm=x" class="tickets onsalenow">Buy Tickets</a>
<div class="eventItem entry parking suites clearfix"> <div class="thumb"><a href="https://www.statefarmarena.com/events/detail/olivia-rodrigo"><img src="https://x/olivia.jpg" alt=""/></a></div>
<div class="date" aria-label="November 11 to November 12 2026"></div>
<h3 class="title"><a href="https://www.statefarmarena.com/events/detail/olivia-rodrigo" title="More Info">Olivia Rodrigo</a></h3>
<h4 class="tagline"> The Unraveled Tour with Devon Again </h4> <span class="start"> 7:30 PM</span>
<div class="eventItem entry clearfix"> <div class="date" aria-label="October 12 2026"></div>
<h3 class="title"><a href="https://www.statefarmarena.com/events/detail/hawks" title="More Info">Preseason: Hawks vs Grizzlies</a></h3>
<a href="https://www.ticketmaster.com/hawks/event/0E00FFFF" class="tickets onsalenow">Buy Tickets</a>
"""


def test_sfa_multi_night_runs_and_sold_out_cards():
    rows = fv.parse_sfa("state_farm", SFA)
    assert [(r["artist"], r["date"], r["status"]) for r in rows] == [
        ("Weezer", "2026-10-10", "on_sale"),
        ("Olivia Rodrigo", "2026-11-11", "sold_out"),
        ("Olivia Rodrigo", "2026-11-12", "sold_out"),
    ]
    assert rows[0]["ticket_url"].startswith("https://www.ticketmaster.com/weezer") and rows[0]["support"] == "Ben Kweller"
    assert rows[1]["ticket_url"] == "https://www.statefarmarena.com/events/detail/olivia-rodrigo"  # no ticket button: the arena page
    assert rows[1]["support"] == "Devon Again" and rows[1]["start_at"] == "2026-11-11T19:30:00-05:00"
    assert len({r["src_id"] for r in rows}) == 3 and rows[1]["image_url"] == "https://x/olivia.jpg"


def test_headliner_cleanup():
    assert fv.headliner("Weezer: The Gathering") == "Weezer"
    assert fv.headliner('Hulvey - "Could Be Tonight" Tour') == "Hulvey"
    assert fv.headliner("<a href='/x'>Jane Remover</a>: Live Exhibit") == "Jane Remover"
    assert fv.headliner("Bragolin & Carrellee") == "Bragolin & Carrellee"


MASQ = """
<article class="event"><div class="eventStartDate" itemprop="startDate" content="September 26, 2026 6:00 pm"></div>
<a class="wrapperLink" href="https://www.masqueradeatlanta.com/events/the-browning/"><h2 class="eventHeader__title js-listTitle">The Browning</h2>
<h4 class="eventHeader__support">Deadlands, Extortionist, &amp; Blind Equation</h4></a><p><span class="js-listVenue">Hell</span> at The Masquerade</p>
<a class="btn" itemtype="http://schema.org/Offer" href="?camefrom=cfc_masquerade_website" itemprop="url">Buy Tickets</a>
<article class="event"><div class="eventStartDate" itemprop="startDate" content="September 27, 2026 7:00 pm"></div>
<a class="wrapperLink" href="https://www.masqueradeatlanta.com/events/castle-rat/"><h2 class="eventHeader__title js-listTitle">Castle Rat</h2></a>
<p><span class="js-listVenue">Purgatory</span> at The Masquerade</p>
<a class="btn" itemtype="http://schema.org/Offer" href="https://www.axs.com/events/1/castle-rat-tickets" itemprop="url">Sold Out</a>
"""


def test_masquerade_rooms_doors_and_bad_hrefs():
    rows = fv.parse_masquerade("masquerade", MASQ)
    assert [(r["artist"], r["room"], r["status"], r["ticket_url"]) for r in rows] == [
        ("The Browning", "Hell", "on_sale", None),
        ("Castle Rat", "Purgatory", "sold_out", "https://www.axs.com/events/1/castle-rat-tickets"),
    ]
    assert rows[0]["doors_at"] == "2026-09-26T18:00:00-04:00" and rows[0]["start_at"] == "2026-09-26T19:00:00-04:00"
    assert rows[0]["support"] == "Deadlands, Extortionist, & Blind Equation"


def test_livenation_jsonld():
    page = ('<script type="application/ld+json">[{"@type":"MusicEvent","name":"Kany Garcia: Puerta Abierta Tour",'
            '"startDate":"2026-10-01T20:00:00-04:00","url":"https://www.ticketmaster.com/x/event/0E006488C11FDD7B",'
            '"image":"https://s1.ticketm.net/a.jpg","eventStatus":"https://schema.org/EventCancelled"}]</script>')
    (row,) = fv.parse_livenation("roxy", page)
    assert row["artist"] == "Kany Garcia" and row["status"] == "cancelled" and row["image_url"].endswith("a.jpg")


def test_seller_names_and_show_matching():
    assert tickets.seller_from_url("https://www.axs.com/events/1/x") == "AXS"
    assert tickets.seller_from_url("https://www.ticketmaster.com/e/event/1") == "Ticketmaster"
    assert tickets.seller_from_url("https://trapkaraoke.com/events/atl") == "trapkaraoke.com"
    event = {"artist": {"name": "Weezer"}, "venue": {"name": "State Farm Arena"}, "start_at": "2026-10-10T19:00:00-04:00"}
    assert tickets._same_show(event, "Weezer", "State Farm Arena", "2026-10-10T23:00:00")
    assert not tickets._same_show(event, "Parking Pass: Weezer", "State Farm Arena", "2026-10-10T23:00:00")
    assert not tickets._same_show(event, "Weezer", "Coca-Cola Roxy", "2026-10-10T23:00:00")
    assert not tickets._same_show(event, "Weezer", "State Farm Arena", "2026-11-10T23:00:00")
    assert not tickets._same_show(event, "Foo Fighters", "State Farm Arena", "2026-10-10T23:00:00")
