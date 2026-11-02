namespace Alamida.Calendar.Profiles;

public static class TerminOrtFields
{
    public static void MergeOrtUndZusatz(Dictionary<string, string?> fields)
    {
        fields["beisetzungsort"] = TerminOrtFormatter.Combine(
            fields.GetValueOrDefault("beisetzungsort"),
            fields.GetValueOrDefault("beisetzungsortZusatz"));
        fields["rosenkranzort"] = TerminOrtFormatter.Combine(
            fields.GetValueOrDefault("rosenkranzort"),
            fields.GetValueOrDefault("rosenkranzortZusatz"));
        fields["trauerfeierort"] = TerminOrtFormatter.Combine(
            fields.GetValueOrDefault("trauerfeierort"),
            fields.GetValueOrDefault("trauerfeierortZusatz"));
        fields["trauerfeier2ort"] = TerminOrtFormatter.Combine(
            fields.GetValueOrDefault("trauerfeier2ort"),
            fields.GetValueOrDefault("trauerfeier2ortZusatz"));
        fields["aufnahmeort"] = TerminOrtFormatter.Combine(
            fields.GetValueOrDefault("aufnahmeort"),
            fields.GetValueOrDefault("aufnahmeortZusatz"));
    }
}
