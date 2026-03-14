from datetime import datetime


def indian_date_filter(date_str):
    if not date_str:
        return ''
    try:
        if isinstance(date_str, str):
            dt = datetime.strptime(date_str, '%Y-%m-%d')
        else:
            dt = date_str
        return dt.strftime('%d/%m/%Y')
    except Exception:
        return date_str


def register_template_filters(app):
    app.add_template_filter(indian_date_filter, name='indian_date')
